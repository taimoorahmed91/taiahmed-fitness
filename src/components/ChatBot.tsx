import { useState, useEffect, useCallback, useRef } from 'react';
import { toast, useSonner } from 'sonner';
import { MessageCircle, X, Send, Loader2, Utensils, Dumbbell, Scale, Moon, Zap, ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { showUndoToast } from '@/components/ui/undo-toast';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  statusCode?: number;
}

type Category = 'meals' | 'gym' | 'weight' | 'sleep' | 'action' | 'test' | null;

const categoryConfig = {
  meals: { label: 'Meals', icon: Utensils, message: 'fittrack_meals' },
  gym: { label: 'Gym', icon: Dumbbell, message: 'fittrack_gym_sessions' },
  weight: { label: 'Weight', icon: Scale, message: 'fittrack_weight' },
  sleep: { label: 'Sleep', icon: Moon, message: 'fittrack_sleep' },
  action: { label: 'Action', icon: Zap, message: null },
};

// Test button and HTTP status badges are for developers only; real users never see them.
const SHOW_DEV_TOOLS = import.meta.env.DEV;

/**
 * True when focus is on something that opens the on-screen keyboard or a picker (text-like inputs,
 * date/time pickers, select, textarea, contenteditable, combobox/listbox/textbox roles, so an open Radix select counts). Buttons, checkboxes,
 * radios, sliders and file pickers do not count. Takes a minimal element shape so it can be unit tested.
 */
const NON_TEXT_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file', 'image', 'color', 'hidden']);
interface FocusTargetLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
}
// eslint-disable-next-line react-refresh/only-export-components
export function isFormEntryElement(el: FocusTargetLike | null | undefined): boolean {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((el.type ?? 'text').toLowerCase());
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.('role');
  return role === 'combobox' || role === 'textbox' || role === 'searchbox' || role === 'spinbutton' || role === 'listbox' || role === 'option';
}

/** The chat's own button and panel manage their own focus; they must never hide the button. */
const CHAT_OWN_SELECTOR = '[data-chat-assistant]';

const MAX_MESSAGES_PER_HOUR = 5;
const RATE_LIMIT_KEY = 'chatbot_message_timestamps';

const ChatBot = () => {
  const { isLoggedIn, user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category>(null);
  const [messageCount, setMessageCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const { toasts: sonnerToasts } = useSonner();
  // True while a form field elsewhere on the page has focus. The button gets out of the way then, so it can
  // never sit on top of the control being edited (or its calendar/picker icon) on a small screen.
  const [fieldFocused, setFieldFocused] = useState(false);

  // Toasts appear in the bottom-right corner, right where the button sits. Lift the button above them.
  const visibleToasts = sonnerToasts.length;
  const liftRem = visibleToasts > 0 ? Math.min(visibleToasts, 3) * 4.5 : 0;
  // The bottom offset keeps clear of the phone home bar, and of a bottom navigation bar once one exists
  // (set --bottom-bar-height on the layout wrapper; it is 0 until then). AppLayout reserves matching space at the
  // end of every page (CHAT_FAB_CLEARANCE in layout/Page.tsx); keep this edge and the h-14 size in step with it.
  const fabBottom = `calc(max(1rem, env(safe-area-inset-bottom)) + var(--bottom-bar-height, 0px) + ${liftRem}rem)`;

  // Get valid timestamps from localStorage (within the last hour)
  const getValidTimestamps = useCallback((): number[] => {
    const stored = localStorage.getItem(RATE_LIMIT_KEY);
    if (!stored) return [];
    
    const timestamps: number[] = JSON.parse(stored);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return timestamps.filter(ts => ts > oneHourAgo);
  }, []);

  // Update message count on mount and when messages are sent
  const updateMessageCount = useCallback(() => {
    const validTimestamps = getValidTimestamps();
    // Clean up old timestamps
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(validTimestamps));
    setMessageCount(validTimestamps.length);
  }, [getValidTimestamps]);

  useEffect(() => {
    updateMessageCount();
    // Update count every minute to handle expiring timestamps
    const interval = setInterval(updateMessageCount, 60000);
    return () => clearInterval(interval);
  }, [updateMessageCount]);

  // Auto-scroll to bottom when messages change or loading state changes
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const canSendMessage = messageCount < MAX_MESSAGES_PER_HOUR;

  const recordMessageSent = () => {
    const validTimestamps = getValidTimestamps();
    validTimestamps.push(Date.now());
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(validTimestamps));
    setMessageCount(validTimestamps.length);
  };

  // Hide the button while a form field outside the chat has focus. Handled once, here, for every page and
  // dialog, instead of padding around individual controls. Focus is re-read after the event settles
  // (setTimeout 0), so moving from one field straight to another never flashes the button back.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      const active = document.activeElement;
      const own = typeof active?.closest === 'function' && active.closest(CHAT_OWN_SELECTOR);
      setFieldFocused(!own && isFormEntryElement(active));
    };
    const onFocusChange = () => {
      clearTimeout(timer);
      timer = setTimeout(sync, 0);
    };
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    sync();
    return () => {
      clearTimeout(timer);
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
    };
  }, []);

  // Only render for authenticated users
  if (!isLoggedIn) return null;

  // An open chat keeps its button: it is the close control, and the panel is already the user's choice.
  const hideFab = fieldFocused && !isOpen;

  const handleCategorySelect = (category: Category) => {
    if (category === 'action') {
      toast('Action', { description: 'This feature is not available yet' });
      return;
    }
    setSelectedCategory(category);
  };

  const handleTestFunction = async () => {
    if (!canSendMessage) {
      toast.error('Rate limit reached', { description: 'You can only send 5 messages per hour. Please wait.' });
      return;
    }

    // Set to test mode to show chat interface
    setSelectedCategory('test');

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: 'Testing demo webhook...',
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    recordMessageSent();

    try {
      const response = await supabase.functions.invoke('chat-webhook', {
        body: { action: 'test' },
      });

      const statusCode = response.data?.statusCode || (response.error ? 500 : 200);

      const botMessage: Message = {
        id: crypto.randomUUID(),
        content: response.data?.response || response.error?.message || 'No response received',
        sender: 'bot',
        timestamp: new Date(),
        statusCode,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error calling test function:', error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        content: 'Failed to call test function. Please try again.',
        sender: 'bot',
        timestamp: new Date(),
        statusCode: 500,
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast.error('Failed to call test function.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  // Chat history is local only, so clearing is immediate with an Undo (no confirmation dialog).
  const handleClearChat = () => {
    const snapshot = messages;
    if (snapshot.length === 0) return;
    setMessages([]);
    showUndoToast({
      message: 'Chat cleared',
      onUndo: () => setMessages((current) => [...snapshot, ...current]),
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !selectedCategory) return;

    if (!canSendMessage) {
      toast.error('Rate limit reached', { description: 'You can only send 5 messages per hour. Please wait.' });
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: input.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    recordMessageSent();

    try {
      const categoryMessage = categoryConfig[selectedCategory].message;
      
      const response = await supabase.functions.invoke('chat-webhook', {
        body: { 
          action: 'chat',
          message: categoryMessage,
          userid: user?.id,
          question: userMessage.content
        },
      });

      const statusCode = response.data?.statusCode || (response.error ? 500 : 200);
      
      const botMessage: Message = {
        id: crypto.randomUUID(),
        content: response.data?.response || response.error?.message || 'Message sent successfully!',
        sender: 'bot',
        timestamp: new Date(),
        statusCode,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        content: 'Failed to send message. Please try again.',
        sender: 'bot',
        timestamp: new Date(),
        statusCode: 500,
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter sends, Shift+Enter is ignored by this single-line input; never send mid-IME composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getStatusBadgeVariant = (code: number) => {
    if (code >= 200 && code < 300) return 'default';
    if (code >= 400) return 'destructive';
    return 'secondary';
  };

  const resetChat = () => {
    setMessages([]);
    setSelectedCategory(null);
    setInput('');
  };

  const closeChat = () => {
    setIsOpen(false);
    fabRef.current?.focus();
  };

  return (
    <>
      {/* Floating Button */}
      <IconButton
        ref={fabRef}
        variant="default"
        label={isOpen ? 'Close chat assistant' : 'Open chat assistant'}
        aria-expanded={isOpen}
        aria-controls="chat-assistant-panel"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) resetChat();
        }}
        style={{ bottom: fabBottom }}
        data-chat-assistant="fab"
        data-hidden-for-field={hideFab || undefined}
        tabIndex={hideFab ? -1 : undefined}
        aria-hidden={hideFab || undefined}
        className={`fixed right-[max(1rem,env(safe-area-inset-right))] z-50 h-14 w-14 rounded-full shadow-lg transition-[bottom,background-color,transform,opacity,visibility] duration-200 motion-reduce:transition-none sm:right-6 [@media(pointer:coarse)]:h-14 [@media(pointer:coarse)]:w-14 ${hideFab ? 'pointer-events-none invisible translate-y-2 opacity-0' : ''}`}
      >
        {isOpen ? <X className="!h-6 !w-6" /> : <MessageCircle className="!h-6 !w-6" />}
      </IconButton>

      {/* Chat Window */}
      {isOpen && (
        <Card
          id="chat-assistant-panel"
          data-chat-assistant="panel"
          role="region"
          aria-label="Chat assistant"
          onKeyDown={(e) => { if (e.key === 'Escape') closeChat(); }}
          style={{ bottom: `calc(${fabBottom} + 4.5rem)`, maxHeight: `calc(100dvh - 7rem - ${fabBottom})` }}
          className="fixed right-[max(1rem,env(safe-area-inset-right))] z-50 w-[min(24rem,calc(100vw-2rem))] overflow-y-auto shadow-xl sm:right-6"
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              {selectedCategory && (
                <IconButton label="Back to topics" size="sm" className="mr-1" onClick={handleBack}>
                  <ArrowLeft />
                </IconButton>
              )}
              <MessageCircle aria-hidden="true" className="h-5 w-5" />
              <span className="flex-1">
                {selectedCategory === 'test'
                  ? 'Test Function'
                  : selectedCategory 
                    ? `Chat - ${categoryConfig[selectedCategory].label}` 
                    : 'Chat Assistant'}
              </span>
              <Badge
                variant={canSendMessage ? 'secondary' : 'destructive'}
                className="text-xs"
                aria-label={`${messageCount} of ${MAX_MESSAGES_PER_HOUR} messages used this hour`}
              >
                {messageCount}/{MAX_MESSAGES_PER_HOUR}
              </Badge>
              {selectedCategory && messages.length > 0 && (
                <IconButton label="Clear chat" tooltip size="sm" onClick={handleClearChat}>
                  <Trash2 />
                </IconButton>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedCategory ? (
              // Category Selection
              <div className="p-4 space-y-2">
                {SHOW_DEV_TOOLS && (
                  <Button
                    variant="secondary"
                    className="w-full justify-start gap-3 mb-4"
                    onClick={handleTestFunction}
                    disabled={isLoading}
                  >
                    <Zap className="h-4 w-4" />
                    Test Function (dev)
                  </Button>
                )}
                <p className="text-sm text-muted-foreground mb-4">Select a topic to chat about:</p>
                {(Object.keys(categoryConfig) as Category[]).map((category) => {
                  if (!category) return null;
                  const config = categoryConfig[category];
                  const Icon = config.icon;
                  return (
                    <Button
                      key={category}
                      variant="outline"
                      className="w-full justify-start gap-3"
                      onClick={() => handleCategorySelect(category)}
                    >
                      <Icon className="h-4 w-4" />
                      {config.label}
                    </Button>
                  );
                })}
              </div>
            ) : (
              // Chat Interface
              <>
                <ScrollArea className="h-[min(20rem,calc(100dvh-20rem))] min-h-40 px-4">
                  {/* role="log": new messages are announced politely without moving focus. */}
                  <div role="log" aria-live="polite" aria-relevant="additions text" aria-label="Chat messages" className="space-y-3 py-4">
                    {messages.length === 0 && !isLoading && (
                      <p className="py-24 text-center text-sm text-muted-foreground">
                        {selectedCategory === 'test'
                          ? 'Test function results will appear here...'
                          : `Ask about your ${categoryConfig[selectedCategory]?.label.toLowerCase()}...`}
                      </p>
                    )}
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <span className="sr-only">{msg.sender === 'user' ? 'You said:' : 'Assistant said:'}</span>
                        <div
                          className={`max-w-[80%] break-words rounded-lg px-3 py-2 text-sm ${
                            msg.sender === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {msg.content}
                        </div>
                        {SHOW_DEV_TOOLS && msg.sender === 'bot' && msg.statusCode && (
                          <Badge
                            variant={getStatusBadgeVariant(msg.statusCode)}
                            className="mt-1 text-xs"
                          >
                            HTTP {msg.statusCode}
                          </Badge>
                        )}
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex flex-col items-start">
                        <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                          <span className="text-sm text-muted-foreground motion-safe:animate-pulse">
                            Agent is typing...
                          </span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
                {selectedCategory !== 'test' && (
                  <div className="p-4 border-t">
                    <div className="flex gap-2">
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        aria-label="Message"
                        enterKeyHint="send"
                        disabled={isLoading}
                        className="flex-1"
                      />
                      <IconButton
                        label="Send message"
                        variant="default"
                        onClick={sendMessage}
                        loading={isLoading}
                        disabled={!input.trim()}
                      >
                        <Send />
                      </IconButton>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default ChatBot;
