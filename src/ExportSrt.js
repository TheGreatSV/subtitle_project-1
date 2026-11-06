import React, { useState } from 'react';
import ExportDialog from './ExportDialog';
import { useToast } from './Toast';

/** Toolbar "Export" button + dialog (SRT, VTT, ASS, SBV, TXT, CSV). */
function ExportSrt({ cues, defaultName, show, setShow }) {
  const [localShow, setLocalShow] = useState(false);
  const open = show ?? localShow;
  const setOpen = setShow ?? setLocalShow;
  const toast = useToast();

  return (
    <>
      <button className="ws-btn" onClick={() => setOpen(true)} disabled={cues.length === 0} title="Export (Ctrl+Shift+E)">Export</button>
      <ExportDialog
        show={open}
        setShow={setOpen}
        cues={cues}
        defaultName={defaultName}
        onExported={(name) => toast.success(`Exported ${name} (${cues.length} cue${cues.length === 1 ? '' : 's'})`)}
      />
    </>
  );
}

export default ExportSrt;
