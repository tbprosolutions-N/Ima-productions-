import jsPDF from 'jspdf';
import { supabase } from '@/lib/supabase';
import { parseTemplateVariables } from '@/lib/utils';

interface GenerateAgreementOptions {
  eventId: string;
  templateId?: string;
  sendEmail?: boolean;
  /** Owner email to always receive a copy of the Appearance Agreement */
  ownerEmail?: string;
}

class AgreementService {
  async generateAgreement(options: GenerateAgreementOptions): Promise<Blob> {
    const { eventId, templateId } = options;

    try {
      // Fetch event with related data
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select(`
          *,
          client:clients(*),
          artist:artists(*),
          agency:agencies(*)
        `)
        .eq('id', eventId)
        .single();

      if (eventError || !event) throw eventError;

      // Fetch template
      let template;
      if (templateId) {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', templateId)
          .single();
        
        if (error) throw error;
        template = data;
      } else {
        // Get default agreement template (client_agreement or legacy agreement)
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('agency_id', event.agency_id)
          .in('type', ['client_agreement', 'agreement', 'appearance_agreement'])
          .limit(1)
          .single();
        
        if (error || !data) throw error || new Error('No agreement template found');
        template = data;
      }

      const templateContent = (template as { content?: string; template?: string }).content ?? (template as { template?: string }).template ?? '';
      if (!templateContent) throw new Error('Template has no content');

      // Prepare variables for template
      const client = (event as { client?: { name?: string; email?: string; vat_id?: string; address?: string; phone?: string } }).client;
      const artist = (event as { artist?: { name?: string; email?: string; vat_id?: string; phone?: string } }).artist;
      const variables = {
        date: new Date().toLocaleDateString('he-IL'),
        client_name: client?.name ?? event.business_name,
        client_vat: client?.vat_id ?? '',
        client_address: (client as { address?: string })?.address ?? '',
        client_phone: client?.phone ?? '',
        client_email: client?.email ?? '',
        artist_name: artist?.name ?? '',
        artist_vat: (artist as { vat_id?: string })?.vat_id ?? '',
        artist_phone: artist?.phone ?? '',
        artist_email: artist?.email ?? '',
        event_date: new Date(event.event_date).toLocaleDateString('he-IL'),
        amount: `${event.amount.toLocaleString('he-IL')} ₪`,
        due_date: event.due_date ? new Date(event.due_date).toLocaleDateString('he-IL') : '',
        business_name: event.business_name,
      };

      // Parse template with variables
      const content = parseTemplateVariables(templateContent, variables);

      // Generate PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Add Hebrew font support (requires custom font)
      // For now, using default font with UTF-8 support
      pdf.setFont('helvetica');
      pdf.setFontSize(12);
      pdf.setR2L(true);

      // Split content into lines and add to PDF
      const lines = pdf.splitTextToSize(content, 170);
      let y = 20;
      
      lines.forEach((line: string) => {
        if (y > 280) {
          pdf.addPage();
          y = 20;
        }
        pdf.text(line, 200, y, { align: 'right' });
        y += 7;
      });

      // Generate blob
      const pdfBlob = pdf.output('blob');

      // Send email if requested
      const clientEmail = client?.email ?? (event as { client_email?: string }).client_email;
      if (options.sendEmail && clientEmail) {
        await this.sendAgreementEmail(clientEmail, pdfBlob, event.business_name);
      }

      // Always send a copy to the owner when provided
      if (options.ownerEmail) {
        await this.sendAgreementEmail(options.ownerEmail, pdfBlob, event.business_name);
      }

      return pdfBlob;
    } catch (error) {
      console.error('Error generating agreement:', error);
      throw error;
    }
  }

  async sendAgreementEmail(email: string, pdfBlob: Blob, businessName: string): Promise<void> {
    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]);
        };
        reader.readAsDataURL(pdfBlob);
      });

      await base64Promise; // base64 PDF ready for future send-email Edge Function

      // TODO: Implement email sending via Supabase Edge Function or external service
      if (import.meta.env.DEV) {
        console.log(`Sending agreement to ${email} for ${businessName}`);
      }

    } catch (error) {
      console.error('Error sending agreement email:', error);
      throw error;
    }
  }

  async downloadAgreement(eventId: string): Promise<void> {
    const blob = await this.generateAgreement({ eventId });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agreement-${eventId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const agreementService = new AgreementService();
