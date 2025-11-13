import type { Thread } from '@langchain/langgraph-sdk';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLangGraph } from '../hooks/useLangGraph';
import type { ChatConfig } from '../types/chat';
import { Button } from './ui/button';

export default function ThreadsHistoryPanel({ isOpen, onClose, config, onThreadClick, userInfo }: IThreadsHistoryPanelProps) {
  const stream = useLangGraph(config);
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchThreads();
    }
  }, [isOpen]);

  const fetchThreads = async () => {
    const threads = await stream.client.threads.search({
      offset: 0,
      limit: 1000,
      metadata: {
        user_id: userInfo.user,
      },
    });
    setThreads(threads);
  };

  const getTitle = (thread: Thread<any>) => {
    const firstMessage = thread?.values?.messages?.[0]?.content;
    if (typeof firstMessage === 'string') {
      return firstMessage;
    }
    return 'Untitled';
  };

  const onSelectThread = (thread: Thread<any>) => {
    onThreadClick(thread);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-background z-10 flex flex-col">
      <div className="flex items-center justify-between gap-3 p-4 border-b">
        <h2 className="font-semibold">Threads History</h2>
        <Button variant="ghost" size="icon" type="button" onClick={() => onClose()}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="h-0 flex-grow overflow-y-auto p-3">
        {threads?.length > 0 ? (
          <div>
            {threads.map((thread) => (
              <div
                key={thread.thread_id}
                className="p-3 flex items-center justify-between gap-4 text-sm cursor-pointer hover:bg-muted/50 transition-colors rounded-md"
                onClick={() => onSelectThread(thread)}
              >
                <span className="truncate font-medium">{getTitle(thread)}</span>
                <span className="flex-shrink-0 text-sm text-muted-foreground">{new Date(thread.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">No threads found</div>
        )}
      </div>
    </div>
  );
}

interface IThreadsHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChatConfig;
  onThreadClick: (thread: Thread<any>) => void;
  userInfo: any;
}
