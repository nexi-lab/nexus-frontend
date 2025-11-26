import type { Message } from '@langchain/langgraph-sdk';
import { CheckCircle, Loader2, Maximize2 } from 'lucide-react';
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
  const [showDetails, setShowDetails] = useState(false);

  // Find the tool result message
  const result = messages?.find((m: any) => m.tool_call_id === toolCall.id);

  // Parse tool input (arguments)
  const toolInput = toolCall.args || toolCall.arguments || {};
  const inputStr = isComplexValue(toolInput) ? JSON.stringify(toolInput, null, 2) : String(toolInput || '');

  // Parse tool output (result)
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

  const outputStr = isJsonContent ? JSON.stringify(parsedContent, null, 2) : String(parsedContent || '');
  
  // Get one-line snippet for RESPONSE
  const getResponseSnippet = (str: string): string => {
    // Strip newlines and truncate to one line
    const singleLine = str.replace(/\n/g, ' ').trim();
    return singleLine.length > 100 ? singleLine.substring(0, 100) + '...' : singleLine;
  };
  const responseSnippet = result ? getResponseSnippet(outputStr) : '';

  return (
    <>
      <div className="p-3 rounded-xl bg-[#393939] text-white transition-all duration-300 overflow-x-hidden relative w-full">
        <div className="flex items-center justify-between gap-5 w-full mb-2">
          <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
            {result ? <CheckCircle className="text-green-500 flex-shrink-0" size={20} /> : <Loader2 className="flex-shrink-0 animate-spin" size={16} />}
            <span className="truncate font-medium">{toolCall.name}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="bg-white/10 text-white hover:bg-white/15 rounded-full py-1 px-2 flex-shrink-0 h-auto absolute top-2 right-2"
            onClick={() => setShowDetails(true)}
            title="Expand to view full content"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
        </div>

        {/* RESPONSE section - shown first, one line only */}
        {result && (
          <div className="mt-2 space-y-1">
            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">RESPONSE</div>
            <div className="bg-black/20 rounded p-2 text-xs font-mono overflow-x-auto">
              <div className="text-xs whitespace-nowrap">{responseSnippet}</div>
            </div>
          </div>
        )}

        {/* PARAMETERS section - shown second, snippet mode (one line only) */}
        <div className="mt-2 space-y-1">
          <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">PARAMETERS</div>
          <div className="bg-black/20 rounded p-2 text-xs font-mono overflow-x-auto">
            {(() => {
              if (isComplexValue(toolInput)) {
                const keys = Object.keys(toolInput);
                if (keys.length === 0) return null;
                const firstKey = keys[0];
                const firstValue = toolInput[firstKey];
                let valueStr = '';
                if (typeof firstValue === 'string') {
                  // Strip newlines and truncate if needed
                  valueStr = firstValue.replace(/\n/g, ' ').trim();
                  valueStr = valueStr.length > 50 ? valueStr.substring(0, 50) + '...' : valueStr;
                } else if (typeof firstValue === 'object' && firstValue !== null) {
                  valueStr = '{...}';
                } else {
                  valueStr = String(firstValue);
                }
                const moreText = keys.length > 1 ? ` (+${keys.length - 1} more)` : '';
                return (
                  <div className="text-xs">
                    <span className="text-blue-400 font-semibold">{firstKey}</span>
                    <span className="text-gray-300"> {valueStr}{moreText}</span>
                  </div>
                );
              }
              // Fallback for non-dict parameters
              return <pre className="text-xs whitespace-pre-wrap break-words">{inputStr}</pre>;
            })()}
          </div>
        </div>
      </div>

      {/* Tool Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Tool: {toolCall.name}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            {/* RESPONSE section - shown first */}
            {result && (
              <div>
                <div className="text-sm font-semibold mb-2">RESPONSE</div>
                {isJsonContent ? (
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                    <pre className="text-sm overflow-auto">
                      <code>{outputStr}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                    <pre className="text-sm whitespace-pre-wrap break-words">{outputStr}</pre>
                  </div>
                )}
              </div>
            )}

            {/* PARAMETERS section - shown second */}
            <div>
              <div className="text-sm font-semibold mb-2">PARAMETERS</div>
              {isComplexValue(toolInput) ? (
                <div className="space-y-2">
                  {Object.entries(toolInput).map(([key, value]) => {
                    const valueStr = typeof value === 'string' 
                      ? value 
                      : (typeof value === 'object' && value !== null 
                          ? JSON.stringify(value, null, 2) 
                          : String(value));
                    const isValueJson = typeof value === 'object' && value !== null;
                    return (
                      <div key={key} className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0">
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{key}:</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            {isValueJson ? (
                              <pre className="text-sm font-mono overflow-auto bg-gray-100 dark:bg-gray-800 rounded p-2">
                                <code>{valueStr}</code>
                              </pre>
                            ) : (
                              <div className="text-sm break-words whitespace-pre-wrap">{valueStr}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                  <pre className="text-sm whitespace-pre-wrap break-words">{inputStr}</pre>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ToolCalls({ toolCalls, messages }: ToolCallsProps) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="grid gap-2 mt-2 w-full min-w-full">
      {toolCalls.map((tc, idx) => (
        <ToolCallItem key={tc.id || idx} toolCall={tc} messages={messages} />
      ))}
    </div>
  );
}
