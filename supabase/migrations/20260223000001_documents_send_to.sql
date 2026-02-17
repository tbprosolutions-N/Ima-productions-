-- Add send_to to document templates: who receives the generated document (artist, client, or both)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS send_to text DEFAULT 'both' CHECK (send_to IN ('artist', 'client', 'both'));

COMMENT ON COLUMN documents.send_to IS 'Recipient for generated doc: artist, client, or both';
