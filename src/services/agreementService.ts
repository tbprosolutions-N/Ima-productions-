// jsPDF (~200KB) is loaded lazily inside generateAgreement — not on module import
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

      // Generate PDF — jsPDF is loaded lazily here to avoid bundling it into EventsPage
      const { default: jsPDF } = await import('jspdf');
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

      // Collect all recipients (client, artist, owner) — no null/empty
      const rawEmails = [
        client?.email ?? (event as { client_email?: string }).client_email,
        artist?.email,
        options.ownerEmail,
      ].filter((e): e is string => typeof e === 'string' && e.trim().length > 0);
      const to = [...new Set(rawEmails.map((e) => e.trim().toLowerCase()))];

      if ((options.sendEmail || options.ownerEmail) && to.length > 0) {
        await this.sendAgreementEmail(to, pdfBlob, event.business_name);
      }

      return pdfBlob;
    } catch (error) {
      console.error('Error generating agreement:', error);
      throw error;
    }
  }

  async sendAgreementEmail(to: string[], pdfBlob: Blob, businessName: string): Promise<void> {
    const recipients = to.filter((e) => typeof e === 'string' && e.trim().length > 0).map((e) => e.trim().toLowerCase());
    if (recipients.length === 0) return;

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const b64 = result?.split(',')[1];
          if (b64) resolve(b64);
          else reject(new Error('Failed to encode PDF to base64'));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(pdfBlob);
      });

      const subject = `הסכם הופעה — ${businessName}`;
      const html = `
        <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;">
          <p style="font-size: 16px; margin-bottom: 16px;">שלום,</p>
          <p style="font-size: 15px; margin-bottom: 16px;">במצורף הסכם ההופעה עבור <strong>${businessName}</strong>.</p>
          <p style="font-size: 15px; margin-bottom: 16px;">המסמך מוכן לחתימה ומכיל את כל הפרטים שנקבעו. נשמח לסייע בשאלות נוספות.</p>
          <p style="font-size: 15px; margin-top: 24px; color: #555;">בברכה,<br/><strong>NPC — ניהול הפקות ואירועים</strong></p>
        </div>
      `;

      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: recipients,
          subject,
          html,
          attachments: [{ content: base64, filename: 'agreement.pdf' }],
        },
      });

      if (error) {
        console.error('Agreement email failed (send-email):', error);
        // Do not throw — resilient; UI flow continues
      }
    } catch (err) {
      console.error('Error sending agreement email:', err);
      // Do not throw — resilient; UI flow continues
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
