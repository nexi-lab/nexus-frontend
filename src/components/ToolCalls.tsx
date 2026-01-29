import type { Message } from '@langchain/langgraph-sdk';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';
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

  // Extract pattern for grep_files to display inline
  const getToolDisplayName = () => {
    if (toolCall.name === 'grep_files' && toolInput.pattern) {
      return (
        <>
          <span className="font-bold">Grep</span>
          {' '}
          <span className="font-normal text-muted-foreground">{toolInput.pattern}</span>
        </>
      );
    }

    if (toolCall.name === 'glob_files' && toolInput.pattern) {
      return (
        <>
          <span className="font-bold">Glob</span>
          {' '}
          <span className="font-normal text-muted-foreground">{toolInput.pattern}</span>
        </>
      );
    }

    if (toolCall.name === 'read_file' && toolInput.read_cmd) {
      // Extract file path - handle both quoted paths (with spaces) and unquoted paths
      const quotedMatch = toolInput.read_cmd.match(/"([^"]+)"/);
      const filePath = quotedMatch ? quotedMatch[1] : toolInput.read_cmd.split(/\s+/).pop();

      if (filePath) {
        const basename = filePath.split('/').pop() || filePath;
        return (
          <>
            <span className="font-bold">Read</span>
            {' '}
            <span className="font-normal text-muted-foreground">{basename}</span>
          </>
        );
      }
    }

    if (toolCall.name === 'write_file') {
      const filePath = toolInput.file_path || toolInput.path || toolInput.filepath;
      if (filePath) {
        const basename = filePath.split('/').pop() || filePath;
        return (
          <>
            <span className="font-bold">Write</span>
            {' '}
            <span className="font-normal text-muted-foreground">{basename}</span>
          </>
        );
      }
    }

    if (toolCall.name === 'bash') {
      return <span className="font-bold">Bash</span>;
    }

    if (toolCall.name === 'python') {
      return <span className="font-bold">Python</span>;
    }

    if (toolCall.name === 'web_search' && toolInput.query) {
      return (
        <>
          <span className="font-bold">Web Search</span>
          {' '}
          <span className="font-normal text-muted-foreground">{toolInput.query}</span>
        </>
      );
    }

    if (toolCall.name === 'web_crawl' && toolInput.url) {
      return (
        <>
          <span className="font-bold">Web Crawl</span>
          {' '}
          <span className="font-normal text-muted-foreground">{toolInput.url}</span>
        </>
      );
    }

    return toolCall.name;
  };

  return (
    <>
      {/* Compact one-line tool call display */}
      <button
        onClick={() => setShowDetails(true)}
        className="w-full px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {result ? (
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 text-gray-600 dark:text-gray-400 flex-shrink-0 animate-spin" />
          )}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {getToolDisplayName()}
          </span>
        </div>
      </button>

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
