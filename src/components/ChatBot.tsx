import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, X, Send, Loader2, Utensils, Dumbbell, Scale, Moon, Zap, ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();

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

  // Only render for authenticated users
  if (!isLoggedIn) return null;

  const handleCategorySelect = (category: Category) => {
    if (category === 'action') {
      toast({
        title: 'Action',
        description: 'This feature is not available yet',
      });
      return;
    }
    setSelectedCategory(category);
  };

  const handleTestFunction = async () => {
    if (!canSendMessage) {
      toast({
        title: 'Rate limit reached',
        description: 'You can only send 5 messages per hour. Please wait.',
        variant: 'destructive',
      });
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
      const response = await fetch('https://n8n.taimoorahmed.com/webhook/demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'test' }),
      });

      const data = await response.text();
      const statusCode = response.status;

      const botMessage: Message = {
        id: crypto.randomUUID(),
        content: data || 'No response received',
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
      toast({
        title: 'Error',
        description: 'Failed to call test function.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !selectedCategory) return;

    if (!canSendMessage) {
      toast({
        title: 'Rate limit reached',
        description: 'You can only send 5 messages per hour. Please wait.',
        variant: 'destructive',
      });
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
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) resetChat();
        }}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        size="icon"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </Button>

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              {selectedCategory && (
                <Button variant="ghost" size="icon" className="h-6 w-6 mr-1" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <MessageCircle className="h-5 w-5" />
              <span className="flex-1">
                {selectedCategory === 'test'
                  ? 'Test Function'
                  : selectedCategory 
                    ? `Chat - ${categoryConfig[selectedCategory].label}` 
                    : 'Chat Assistant'}
              </span>
              <Badge variant={canSendMessage ? 'secondary' : 'destructive'} className="text-xs">
                {messageCount}/{MAX_MESSAGES_PER_HOUR}
              </Badge>
              {selectedCategory && messages.length > 0 && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClearChat} title="Clear chat">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedCategory ? (
              // Category Selection
              <div className="p-4 space-y-2">
                <Button
                  variant="secondary"
                  className="w-full justify-start gap-3 mb-4"
                  onClick={handleTestFunction}
                  disabled={isLoading}
                >
                  <Zap className="h-4 w-4" />
                  Test Function
                </Button>
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
                <ScrollArea className="h-80 px-4">
                  {messages.length === 0 && !isLoading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      {selectedCategory === 'test' 
                        ? 'Test function results will appear here...'
                        : `Ask about your ${categoryConfig[selectedCategory]?.label.toLowerCase()}...`}
                    </div>
                  ) : (
                    <div className="space-y-3 py-4">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                              msg.sender === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {msg.content}
                          </div>
                          {msg.sender === 'bot' && msg.statusCode && (
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-muted-foreground animate-pulse">
                              Agent is typing...
                            </span>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>
                {selectedCategory !== 'test' && (
                  <div className="p-4 border-t">
                    <div className="flex gap-2">
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a message..."
                        disabled={isLoading}
                        className="flex-1"
                      />
                      <Button onClick={sendMessage} disabled={isLoading || !input.trim()} size="icon">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
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
