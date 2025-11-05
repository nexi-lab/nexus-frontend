import { createUniver, defaultTheme, type FUniver, LocaleType, LogLevel, merge, type Univer, UniverInstanceType } from '@univerjs/presets';
import { UniverSheetsAdvancedPreset } from '@univerjs/presets/preset-sheets-advanced';
import UniverPresetSheetsAdvancedEnUs from '@univerjs/presets/preset-sheets-advanced/locales/en-US';
import { UniverSheetsCollaborationPreset } from '@univerjs/presets/preset-sheets-collaboration';
import sheetsCollaborationEnUs from '@univerjs/presets/preset-sheets-collaboration/locales/en-US';
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/presets/preset-sheets-conditional-formatting';
import sheetsConditionalFormattingEnUs from '@univerjs/presets/preset-sheets-conditional-formatting/locales/en-US';
import { UniverSheetsCorePreset } from '@univerjs/presets/preset-sheets-core';
import sheetsCoreEnUs from '@univerjs/presets/preset-sheets-core/locales/en-US';
import { UniverSheetsDataValidationPreset } from '@univerjs/presets/preset-sheets-data-validation';
import sheetsDataValidationEnUs from '@univerjs/presets/preset-sheets-data-validation/locales/en-US';
import { UniverSheetsDrawingPreset } from '@univerjs/presets/preset-sheets-drawing';
import UniverPresetSheetsDrawingEnUs from '@univerjs/presets/preset-sheets-drawing/locales/en-US';
import { UniverSheetsFilterPreset } from '@univerjs/presets/preset-sheets-filter';
import sheetsFilterEnUs from '@univerjs/presets/preset-sheets-filter/locales/en-US';
import { UniverSheetsFindReplacePreset } from '@univerjs/presets/preset-sheets-find-replace';
import sheetsFindReplaceEnUs from '@univerjs/presets/preset-sheets-find-replace/locales/en-US';
import { UniverSheetsHyperLinkPreset } from '@univerjs/presets/preset-sheets-hyper-link';
import sheetsHyperLinkEnUs from '@univerjs/presets/preset-sheets-hyper-link/locales/en-US';
import { UniverSheetsSortPreset } from '@univerjs/presets/preset-sheets-sort';
import sheetsSortEnUs from '@univerjs/presets/preset-sheets-sort/locales/en-US';
import { UniverSheetsThreadCommentPreset } from '@univerjs/presets/preset-sheets-thread-comment';
import sheetsThreadCommentEnUs from '@univerjs/presets/preset-sheets-thread-comment/locales/en-US';
import { UniverSheetsCrosshairHighlightPlugin } from '@univerjs/sheets-crosshair-highlight';
import UniverSheetsCrosshairHighlightEnUS from '@univerjs/sheets-crosshair-highlight/locale/en-US';
import { UniverSheetsZenEditorPlugin } from '@univerjs/sheets-zen-editor';
import sheetsZenEditorEnUs from '@univerjs/sheets-zen-editor/locale/en-US';
import { useEffect, useRef } from 'react';
import '@univerjs/presets/lib/styles/preset-sheets-core.css';
import '@univerjs/presets/lib/styles/preset-sheets-advanced.css';
import '@univerjs/presets/lib/styles/preset-sheets-filter.css';
import '@univerjs/presets/lib/styles/preset-sheets-collaboration.css';
import '@univerjs/presets/lib/styles/preset-sheets-thread-comment.css';
import '@univerjs/presets/lib/styles/preset-sheets-conditional-formatting.css';
import '@univerjs/presets/lib/styles/preset-sheets-data-validation.css';
import '@univerjs/presets/lib/styles/preset-sheets-drawing.css';
import '@univerjs/presets/lib/styles/preset-sheets-find-replace.css';
import '@univerjs/presets/lib/styles/preset-sheets-hyper-link.css';
import '@univerjs/presets/lib/styles/preset-sheets-sort.css';
import { UNIVER_ENDPOINT, UNIVER_LICENSE } from '@/utils/config';

export default function ExcelViewer({ contentBytes }: IExcelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    univerAPI: null as FUniver | null,
    Univer: null as Univer | null,
    // disposable: null as any,
    changed: false,
  });

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const file = new File([contentBytes as unknown as BlobPart], 'excel.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    console.log('file', file);

    const collaboration = undefined;
    const { univerAPI, univer } = createUniver({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: merge(
          {},
          sheetsCoreEnUs,
          UniverPresetSheetsAdvancedEnUs,
          sheetsCollaborationEnUs,
          sheetsThreadCommentEnUs,
          sheetsConditionalFormattingEnUs,
          sheetsDataValidationEnUs,
          UniverPresetSheetsDrawingEnUs,
          sheetsFilterEnUs,
          sheetsFindReplaceEnUs,
          sheetsHyperLinkEnUs,
          sheetsSortEnUs,
          sheetsZenEditorEnUs,
          UniverSheetsCrosshairHighlightEnUS,
        ),
      },
      collaboration,
      logLevel: LogLevel.VERBOSE,
      theme: defaultTheme,
      // override: [[ISocketService, { useClass: WebSocketService }]],
      presets: [
        UniverSheetsCorePreset({
          container: containerRef.current as string | HTMLElement | undefined,
          ribbonType: 'simple',
          menu: {
            'sheets-exchange-client.operation.exchange': {
              hidden: true,
            },
          },
          header: true,
        }),
        UniverSheetsDrawingPreset({
          collaboration,
        }),
        UniverSheetsAdvancedPreset({
          useWorker: false,
          universerEndpoint: UNIVER_ENDPOINT,
          license: UNIVER_LICENSE,
        }),
        ...(collaboration ? [UniverSheetsCollaborationPreset()] : []),
        UniverSheetsThreadCommentPreset({
          collaboration,
        }),
        UniverSheetsConditionalFormattingPreset(),
        UniverSheetsDataValidationPreset(),
        UniverSheetsFilterPreset(),
        UniverSheetsFindReplacePreset(),
        UniverSheetsSortPreset(),
        UniverSheetsHyperLinkPreset(),
      ],
      plugins: [UniverSheetsCrosshairHighlightPlugin, UniverSheetsZenEditorPlugin],
    });
    univer.createUnit(UniverInstanceType.UNIVER_SHEET, {});
    state.current.univerAPI = univerAPI;
    // state.current.disposable = univerAPI.addEvent(univerAPI.Event.SheetValueChanged, () => {
    //   console.log('sheet value changed');
    //   state.current.changed = true;
    // });
    const snapshot: any = await state.current.univerAPI?.importXLSXToSnapshotAsync(file);
    const workbook = state.current.univerAPI?.createWorkbook(snapshot);
    console.log('workbook', workbook);
  };

  return <div ref={containerRef} />;
}

interface IExcelViewerProps {
  contentBytes: Uint8Array | null | undefined;
}
