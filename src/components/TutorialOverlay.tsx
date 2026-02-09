import React from 'react';

interface TutorialOverlayProps {
  onClose: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onClose }) => {
  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center bg-slate-900/70 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-heading"
    >
      <div className="relative w-full max-w-4xl max-h-full overflow-y-auto rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="tutorial-heading" className="text-3xl font-semibold text-slate-900">
              Technische Hintergründe: Wie spricht ein Netzwerk?
            </h2>
            <p className="mt-2 text-slate-600">
              Willkommen! Dieser Leitfaden führt dich Schritt für Schritt durch die wichtigsten Komponenten
              moderner Netzwerke. Wir erklären jeden Baustein mit anschaulichen Beispielen – ganz ohne
              Fachchinesisch, aber so fundiert, dass auch Studierende der Informatik damit lernen können.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring focus-visible:ring-slate-400"
            aria-label="Tutorial schließen"
          >
            Schließen
          </button>
        </div>

        <section className="mt-8 space-y-4 text-slate-700">
          <h3 className="text-2xl font-semibold text-slate-900">Das Grundprinzip</h3>
          <p>
            Ein Netzwerk ist wie ein digitaler Campus: Geräte (Clients) wollen Daten austauschen. Damit das
            geordnet funktioniert, braucht es Verkehrsregeln (Protokolle) und Verkehrsleitsysteme (Netzwerkgeräte).
            Jedes Gerät übernimmt eine Aufgabe in diesem Teamplay.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-slate-700">
          <h3 className="text-2xl font-semibold text-slate-900">Kernkomponenten und ihre Aufgaben</h3>
          <div className="space-y-6">
            <article>
              <h4 className="text-xl font-semibold text-slate-900">Router</h4>
              <p>
                Router sind die Navigationszentralen. Sie verbinden verschiedene Netzwerke miteinander
                (z. B. dein Heimnetz und das Internet) und entscheiden anhand von Routing-Tabellen, wohin ein
                Datenpaket als Nächstes gesendet wird. Sie arbeiten auf Schicht 3 des OSI-Modells (Vermittlung) und
                kümmern sich um IP-Adressen, Netzwerksegmentierung sowie den Übergang zwischen Leitungen mit
                unterschiedlichen Übertragungsraten.
              </p>
              <p className="mt-2">
                <strong>Praxisbeispiel:</strong> Dein Heimrouter übersetzt private IP-Adressen mit Network Address
                Translation (NAT), damit mehrere Geräte über eine einzige öffentliche Adresse surfen können.
              </p>
            </article>

            <article>
              <h4 className="text-xl font-semibold text-slate-900">Switches</h4>
              <p>
                Switches bilden das Herzstück lokaler Netzwerke. Sie arbeiten auf Schicht 2 (Sicherung) und leiten
                Ethernet-Frames gezielt nur an den Port weiter, an dem das Zielgerät angeschlossen ist. Dafür führen
                sie eine MAC-Adress-Tabelle. Dadurch entsteht weniger Datenverkehr (Broadcast) und mehr Performance.
              </p>
              <p className="mt-2">
                <strong>Praxisbeispiel:</strong> In einem Firmengebäude verbinden Switches alle Büros. Über VLANs können
                sie logisch getrennte Netze auf demselben physischen Switch realisieren – etwa ein Netz für Gäste und
                eines für interne Systeme.
              </p>
            </article>

            <article>
              <h4 className="text-xl font-semibold text-slate-900">Access Points</h4>
              <p>
                Access Points stellen die drahtlose Brücke zum kabelgebundenen Netz dar. Sie sprechen mit Endgeräten
                per WLAN (IEEE 802.11) und reichen die Daten an das LAN weiter. Moderne Modelle unterstützen
                Roaming (nahtloses Wechseln zwischen Access Points) und Quality of Service, damit Echtzeit-Anwendungen
                priorisiert werden können.
              </p>
            </article>

            <article>
              <h4 className="text-xl font-semibold text-slate-900">Firewalls</h4>
              <p>
                Firewalls filtern den Datenverkehr. Sie prüfen, welche Pakete ins Netzwerk hinein oder hinaus dürfen.
                Das kann auf Paketebene (Layer 3/4) oder in Next-Generation-Varianten sogar bis zur Anwendungsebene
                erfolgen. Regeln lassen sich nach IP, Port, Protokoll oder Inhalt definieren.
              </p>
              <p className="mt-2">
                <strong>Praxisbeispiel:</strong> Eine Firewall blockiert unerwünschte eingehende Verbindungen und lässt
                nur freigegebene Dienste wie HTTPS passieren.
              </p>
            </article>

            <article>
              <h4 className="text-xl font-semibold text-slate-900">Server</h4>
              <p>
                Server sind spezialisierte Rechner, die Dienste bereitstellen – vom Webserver über Datenbanken bis hin
                zu Datei- und E-Mail-Servern. Sie sprechen mit Clients über definierte Protokolle und sind oft rund um
                die Uhr erreichbar. Häufig stehen sie in eigenen Netzsegmenten (Servernetz oder DMZ), die durch
                Firewalls geschützt sind.
              </p>
            </article>

            <article>
              <h4 className="text-xl font-semibold text-slate-900">Clients &amp; Endgeräte</h4>
              <p>
                Dazu zählen PCs, Laptops, Smartphones, IoT-Geräte oder Drucker. Sie nutzen die bereitgestellten Dienste
                und erzeugen den Datenverkehr. Für den sicheren Betrieb erhalten sie Adressen (IP/MAC), werden über
                DHCP konfiguriert und authentifizieren sich gegebenenfalls über zentrale Verzeichnisdienste.
              </p>
            </article>
          </div>
        </section>

        <section className="mt-10 space-y-4 text-slate-700">
          <h3 className="text-2xl font-semibold text-slate-900">Protokolle – die Sprachen des Netzwerks</h3>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Ethernet (Layer 2):</strong> Definiert, wie Frames aufgebaut sind und wie Geräte in einem lokalen
              Netz miteinander kommunizieren. Unterstützt Vollduplex, QoS (802.1p) und VLAN-Tagging (802.1Q).
            </li>
            <li>
              <strong>IP (Layer 3):</strong> Vergibt Adressen und sorgt für das Routing über mehrere Netzwerke hinweg.
              IPv4 ist weit verbreitet, IPv6 löst Adressknappheit und bringt integrierte Sicherheit (IPsec).
            </li>
            <li>
              <strong>TCP und UDP (Layer 4):</strong> TCP garantiert Reihenfolge und Zustellung (z. B. für Web, E-Mail),
              während UDP leichtgewichtige, schnelle Übertragung für Streaming oder VoIP ermöglicht.
            </li>
            <li>
              <strong>DHCP:</strong> Vergibt automatisch IP-Konfigurationen (Adresse, Gateway, DNS). Spart manuellen
              Aufwand und verhindert Adresskonflikte.
            </li>
            <li>
              <strong>DNS:</strong> Übersetzt sprechende Namen wie <code>example.com</code> in IP-Adressen. Ohne DNS
              wäre die Nutzung des Internets extrem unkomfortabel.
            </li>
            <li>
              <strong>HTTPS, SSH &amp; Co.:</strong> Auf Anwendungsebene sorgen Protokolle für sichere Kommunikation,
              Verschlüsselung und Authentifizierung.
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-4 text-slate-700">
          <h3 className="text-2xl font-semibold text-slate-900">Typische Anwendungszenarien</h3>
          <div className="space-y-4">
            <p>
              <strong>Heimnetzwerk:</strong> Ein Router verbindet Internet und Heimnetz, ein Switch verteilt die Leitung
              an Smart-TV, NAS und Arbeits-PCs. Access Points sorgen für WLAN, eine kleine Firewall schützt vor
              unerwünschten Zugriffen.
            </p>
            <p>
              <strong>Unternehmen:</strong> Mehrere Switches bilden das Rückgrat (Core/Distribution/Access-Layer).
              Firewalls segmentieren Abteilungen, VPN-Gateways binden Homeoffice-Mitarbeitende sicher an. Server stellen
              zentrale Dienste bereit, Monitoring überwacht Verfügbarkeit und Sicherheit.
            </p>
            <p>
              <strong>Campus oder Hochschule:</strong> Hunderte Access Points liefern WLAN, Controller koordinieren das
              Roaming, und Identity Services (z. B. RADIUS) sorgen für Authentifizierung. Backbone-Router koppeln
              verschiedene Gebäude.
            </p>
          </div>
        </section>

        <section className="mt-10 space-y-4 text-slate-700">
          <h3 className="text-2xl font-semibold text-slate-900">So nutzt du diese Topologie-Oberfläche optimal</h3>
          <ol className="list-decimal space-y-2 pl-6">
            <li>Ziehe Geräte aus der linken Palette auf die Arbeitsfläche und positioniere sie per Drag &amp; Drop.</li>
            <li>Verbinde sie durch Ziehen von Verbindungen zwischen den Ports.</li>
            <li>Experimentiere mit verschiedenen Szenarien – vom Heimnetz mit wenigen Geräten bis zum Unternehmensnetz
              mit segmentierten Bereichen.</li>
          </ol>
        </section>

        <div className="mt-10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring focus-visible:ring-sky-400"
          >
            Zurück zur Topologie
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialOverlay;
