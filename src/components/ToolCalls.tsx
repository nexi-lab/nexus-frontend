import type { Message } from '@langchain/langgraph-sdk';
import { CheckCircle, Eye, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface ToolCallsProps {
  toolCalls: any[];
  messages: Message[];
}

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === 'object' && value !== null);
}

function ToolCallItem({ toolCall, messages }: { toolCall: any; messages: Message[] }) {
  const [showResult, setShowResult] = useState(false);

  // Find the tool result message
  const result = messages?.find((m: any) => m.tool_call_id === toolCall.id);

  let parsedContent: any;
  let isJsonContent = false;

  try {
    if (result && typeof result.content === 'string') {
      parsedContent = JSON.parse(result.content);
      isJsonContent = isComplexValue(parsedContent);
    } else if (result && Array.isArray(result.content)) {
      // Handle array content format
      const textContent: any = result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) {
        parsedContent = JSON.parse(textContent.text);
        isJsonContent = isComplexValue(parsedContent);
      }
    }
  } catch {
    // Content is not JSON, use as is
    if (result && typeof result.content === 'string') {
      parsedContent = result.content;
    } else if (result && Array.isArray(result.content)) {
      const textContent: any = result.content.find((c: any) => c.type === 'text');
      parsedContent = textContent?.text || '';
    }
  }

  const contentStr = isJsonContent ? JSON.stringify(parsedContent, null, 2) : String(parsedContent || '');

  return (
    <>
      <div className="p-3 rounded-xl bg-[#393939] text-white transition-all duration-300 overflow-x-hidden">
        <div className="flex items-center justify-between gap-5 w-full">
          <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
            <span className="font-semibold flex-shrink-0">Using Tool</span>
            <span className="border-r border-r-white/40 self-stretch flex-shrink-0" />
            {result ? <CheckCircle className="text-green-500 flex-shrink-0" size={20} /> : <Loader2 className="flex-shrink-0 animate-spin" size={16} />}
            <span className="truncate">{toolCall.name}</span>
          </div>
          {result && (
            <Button
              size="sm"
              variant="ghost"
              className="bg-white/10 text-white hover:bg-white/15 rounded-full py-1 px-4 flex-shrink-0 h-auto"
              onClick={() => setShowResult(true)}
            >
              <Eye className="h-3 w-3 mr-1" />
              View
            </Button>
          )}
        </div>
      </div>

      {/* Tool Result Dialog */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Tool Result: {toolCall.name}</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {isJsonContent ? (
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                <pre className="text-sm overflow-auto">
                  <code>{contentStr}</code>
                </pre>
              </div>
            ) : (
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                <pre className="text-sm whitespace-pre-wrap break-words">{contentStr}</pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ToolCalls({ toolCalls, messages }: ToolCallsProps) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="grid gap-2 mt-2">
      {toolCalls.map((tc, idx) => (
        <ToolCallItem key={tc.id || idx} toolCall={tc} messages={messages} />
      ))}
    </div>
  );
}
