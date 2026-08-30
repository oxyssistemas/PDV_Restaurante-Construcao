import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Send, Plus } from 'lucide-react';
import { toast } from 'sonner';
import ModuleGate from '@/components/ModuleGate';

interface Msg { role: 'user' | 'assistant'; content: string }

const suggestions = [
  'Resuma o desempenho do restaurante nos últimos 30 dias.',
  'Quais insumos estão abaixo do estoque mínimo?',
  'Como está minha situação de contas a pagar?',
  'Que cores eu poderia usar na identidade visual do meu restaurante?',
];

export default function AssistantPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const { data: conversations } = useQuery({
    queryKey: ['ai-conversations', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_conversations').select('id, title, created_at')
        .eq('restaurant_id', restaurantId!).order('updated_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  const openConversation = async (id: string) => {
    const { data, error } = await supabase.from('ai_messages').select('role, content')
      .eq('conversation_id', id).order('created_at');
    if (error) { toast.error(error.message); return; }
    setConversationId(id);
    setMessages((data || []).map(m => ({ role: m.role as Msg['role'], content: m.content })));
  };

  const persist = async (convId: string, msg: Msg) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('ai_messages').insert({
      conversation_id: convId, restaurant_id: restaurantId!, user_id: user.id,
      role: msg.role, content: msg.content,
    });
    await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
  };

  const send = async (text: string) => {
    if (!text.trim() || sending || !restaurantId) return;
    const userMsg: Msg = { role: 'user', content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      let convId = conversationId;
      if (!convId) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from('ai_conversations').insert({
          restaurant_id: restaurantId, user_id: user!.id, title: userMsg.content.slice(0, 60),
        }).select('id').single();
        if (error) throw error;
        convId = data.id;
        setConversationId(convId);
        qc.invalidateQueries({ queryKey: ['ai-conversations'] });
      }
      await persist(convId, userMsg);

      const { data, error } = await supabase.functions.invoke('restaurant-assistant', {
        body: { restaurantId, messages: next },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const reply: Msg = { role: 'assistant', content: data.reply };
      setMessages(m => [...m, reply]);
      await persist(convId, reply);
    } catch (e) {
      toast.error((e as Error).message || 'Falha ao falar com a assistente');
      setMessages(m => m.slice(0, -1));
      setInput(userMsg.content);
    } finally {
      setSending(false);
    }
  };

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  return (
    <ModuleGate module="ai">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Sparkles className="h-7 w-7 text-primary" /> Assistente</h1>
            <p className="text-muted-foreground">Análises e sugestões com base apenas nos dados deste restaurante.</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => { setMessages([]); setConversationId(null); }}>
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="hidden lg:block">
            <CardContent className="space-y-1 p-3">
              <p className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">Conversas</p>
              {(conversations || []).length === 0 && <p className="px-2 text-sm text-muted-foreground">Nenhuma ainda.</p>}
              {(conversations || []).map(c => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`w-full truncate rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted ${conversationId === c.id ? 'bg-muted font-medium' : ''}`}
                >
                  {c.title}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="flex min-h-[60vh] flex-col">
            <CardContent className="flex flex-1 flex-col gap-4 p-4">
              <div className="flex-1 space-y-3 overflow-y-auto">
                {messages.length === 0 && (
                  <div className="space-y-3 py-6 text-center">
                    <p className="text-muted-foreground">Pergunte algo sobre a operação do seu restaurante.</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {suggestions.map(s => (
                        <Button key={s} size="sm" variant="outline" onClick={() => send(s)}>{s}</Button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> Analisando...
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <div className="flex items-end gap-2 border-t pt-3">
                <Textarea
                  rows={2}
                  value={input}
                  placeholder="Escreva sua pergunta..."
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                />
                <Button className="gap-2" disabled={sending || !input.trim()} onClick={() => send(input)}>
                  <Send className="h-4 w-4" /> Enviar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ModuleGate>
  );
}
