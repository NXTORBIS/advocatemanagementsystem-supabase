
-- Create ai_case_notes table for AI-generated notes linked to cases
CREATE TABLE public.ai_case_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'ai_note',
  source_conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add source column to case_precedents to track AI-generated vs manual
ALTER TABLE public.case_precedents 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS source_conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL;

-- Enable RLS on ai_case_notes
ALTER TABLE public.ai_case_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_case_notes
CREATE POLICY "Users can view their own AI notes" 
ON public.ai_case_notes FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI notes" 
ON public.ai_case_notes FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI notes" 
ON public.ai_case_notes FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI notes" 
ON public.ai_case_notes FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_ai_case_notes_updated_at
BEFORE UPDATE ON public.ai_case_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_ai_case_notes_case_id ON public.ai_case_notes(case_id);
CREATE INDEX idx_ai_case_notes_user_id ON public.ai_case_notes(user_id);
CREATE INDEX idx_case_precedents_source ON public.case_precedents(source);
