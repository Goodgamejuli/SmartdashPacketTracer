import React, { useRef } from 'react';
import { useTopologyStore } from '../model/useTopologyStore';

type TopBarProps = {
  onShowTutorial: () => void;
};

// Die Top-Bar (speichern, laden, resetten)
const TopBar: React.FC<TopBarProps> = ({ onShowTutorial }) => {
  const exportTopology = useTopologyStore((s) => s.exportTopology);
  const importTopology = useTopologyStore((s) => s.importTopology);
  const clearAll = useTopologyStore((s) => s.clearAll);
  const addLog = useTopologyStore((s) => s.addLog);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const snapshot = exportTopology();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartdash-topologie-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    addLog('Topologie als JSON exportiert.');
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        importTopology(parsed);
        addLog(`Topologie geladen: ${file.name}`);
      } catch (error) {
        console.error(error);
        addLog('Konnte die Datei nicht laden. Bitte gültiges JSON auswählen.');
      }
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    if (window.confirm('Alle Geräte und Verbindungen entfernen?')) {
      clearAll();
      addLog('Arbeitsfläche zurückgesetzt.');
    }
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div>
        <div className="font-semibold text-gray-800">Smartdash Topologie-Designer</div>
        <p className="text-xs text-gray-500">
          Ziehe Geräte aus der Palette, verbinde sie und speichere dein Szenario als JSON.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white shadow hover:bg-blue-700"
        >
          Speichern (JSON)
        </button>
        <button
          type="button"
          onClick={handleLoadClick}
          className="rounded border border-blue-600 px-3 py-1 text-sm font-semibold text-blue-600 hover:bg-blue-50"
        >
          Laden …
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded border border-red-500 px-3 py-1 text-sm font-semibold text-red-500 hover:bg-red-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onShowTutorial}
          className="rounded border border-slate-400 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Überblick Netzwerktechnik
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </header>
  );
};

export default TopBar;
