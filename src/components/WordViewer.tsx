import { createUniver, defaultTheme, type FUniver, LocaleType, LogLevel, merge, type Univer, UniverInstanceType } from '@univerjs/presets';
import { UniverDocsAdvancedPreset } from '@univerjs/preset-docs-advanced';
import UniverPresetDocsAdvancedEnUs from '@univerjs/preset-docs-advanced/locales/en-US';
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core';
import docsCoreEnUs from '@univerjs/preset-docs-core/locales/en-US';
import { UniverDocsDrawingPreset } from '@univerjs/preset-docs-drawing';
import UniverPresetDocsDrawingEnUs from '@univerjs/preset-docs-drawing/locales/en-US';
import { useEffect, useRef } from 'react';
import '@univerjs/presets/lib/styles/preset-docs-core.css';
import '@univerjs/presets/lib/styles/preset-docs-advanced.css';
import '@univerjs/presets/lib/styles/preset-docs-drawing.css';

import { UNIVER_ENDPOINT, UNIVER_LICENSE } from '@/utils/config';

export default function WordViewer({ contentBytes }: IWordViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    univerAPI: null as FUniver | null,
    univer: null as Univer | null,
    changed: false,
    isInitializing: false,
  });

  useEffect(() => {
    let isMounted = true;
    let currentUniver: Univer | null = null;
    
    const initialize = async () => {
      if (!contentBytes || !isMounted) return;
      
      const file = new File([contentBytes as unknown as BlobPart], `${Date.now()}.docx`, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const collaboration = undefined;
      const { univerAPI, univer } = createUniver({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: merge(
            {},
            docsCoreEnUs,
            UniverPresetDocsAdvancedEnUs,
            UniverPresetDocsDrawingEnUs,
          ),
        },
        collaboration,
        logLevel: LogLevel.VERBOSE,
        theme: defaultTheme,
        presets: [
          UniverDocsCorePreset({
            container: containerRef.current as string | HTMLElement | undefined,
            header: true,
          }),
          UniverDocsDrawingPreset({
            collaboration,
          }),
          UniverDocsAdvancedPreset({
            useWorker: false,
            universerEndpoint: UNIVER_ENDPOINT,
            license: UNIVER_LICENSE,
          }),
        ],
      });
      
      if (!isMounted) {
        try {
          univer.dispose();
        } catch (e) {
          // Ignore dispose errors
        }
        return;
      }
      
      currentUniver = univer;
      state.current.univerAPI = univerAPI;
      state.current.univer = univer;
      
      try {
        // Try to import DOCX
        const api = univerAPI as any;
        let snapshot: any = null;
        
        try {
          if (api?.importDOCXToSnapshotAsync) {
            snapshot = await api.importDOCXToSnapshotAsync(file);
          } else if (api?.importDocxToSnapshotAsync) {
            snapshot = await api.importDocxToSnapshotAsync(file);
          } else if (api?.importWordToSnapshotAsync) {
            snapshot = await api.importWordToSnapshotAsync(file);
          }
        } catch (importError: any) {
          // If import fails (e.g., 404 error), log but continue with empty document
          console.warn('DOCX import failed (this may be expected if import service is not available):', importError?.message || importError);
        }
        
        if (!isMounted || currentUniver !== univer) {
          return;
        }
        
        // Create unit with snapshot or empty
        if (snapshot) {
          univer.createUnit(UniverInstanceType.UNIVER_DOC, snapshot);
          console.log('Word document loaded successfully');
        } else {
          // Create empty unit if import fails or is not available
          univer.createUnit(UniverInstanceType.UNIVER_DOC, {});
          console.warn('DOCX import not available or failed, creating empty document');
        }
      } catch (error: any) {
        if (!isMounted || currentUniver !== univer) {
          return;
        }
        console.error('Error loading Word document:', error?.message || error);
        // Create empty unit on error
        try {
          univer.createUnit(UniverInstanceType.UNIVER_DOC, {});
        } catch (fallbackError) {
          console.error('Failed to create document unit:', fallbackError);
        }
      }
    };
    
    initialize();
    
    // Cleanup function
    return () => {
      isMounted = false;
      if (currentUniver) {
        try {
          currentUniver.dispose();
        } catch (error) {
          // Ignore dispose errors during cleanup
        }
      }
      state.current.univer = null;
      state.current.univerAPI = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [contentBytes]);


  return <div ref={containerRef} className="size-full" />;
}

interface IWordViewerProps {
  contentBytes: Uint8Array | null | undefined;
}

