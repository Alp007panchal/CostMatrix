/**
 * The device faces of the panel layout, lifted verbatim from the owner's own
 * high-fidelity mockup (`docs/reference/mockups/panel-layout-front-view-hifi.html`)
 * so the drawing on the screen is the drawing he approved: the ACB with its trip
 * unit and ON/OFF, the MCCB toggle, DIN modules, a 96 × 96 meter, a contactor, a
 * capacitor and a pilot lamp, with the steel, cover and copper gradients.
 *
 * Nothing here is generated or guessed. When the mockup changes, this file is
 * replaced from it rather than edited by hand.
 */
export function LayoutDefs() {
  return (
    <defs>
      <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#d9dbde"/><stop offset="0.5" stopColor="#eceef0"/><stop offset="1" stopColor="#cfd2d6"/></linearGradient>
      <linearGradient id="steelV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e9ebed"/><stop offset="1" stopColor="#c9cdd2"/></linearGradient>
      <linearGradient id="cover" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4f5f6"/><stop offset="1" stopColor="#dcdfe3"/></linearGradient>
      <linearGradient id="copper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e0a066"/><stop offset="0.5" stopColor="#b8692a"/><stop offset="1" stopColor="#8a4a18"/></linearGradient>
      <linearGradient id="copperH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#e0a066"/><stop offset="0.5" stopColor="#b8692a"/><stop offset="1" stopColor="#8a4a18"/></linearGradient>
      <linearGradient id="dev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b6470"/><stop offset="1" stopColor="#2f3640"/></linearGradient>
      <linearGradient id="devL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9aa3ad"/><stop offset="1" stopColor="#6b7480"/></linearGradient>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2d3e50"/><stop offset="1" stopColor="#1b2632"/></linearGradient>
      <pattern id="vent" width="6" height="3" patternUnits="userSpaceOnUse"><rect width="6" height="3" fill="#d7dadf"/><rect x="1" y="1" width="4" height="1" fill="#9aa0a8"/></pattern>
      <pattern id="grid50" width="12.5" height="12.5" patternUnits="userSpaceOnUse"><path d="M12.5 0 L0 0 0 12.5" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/></pattern>
      <filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#000" floodOpacity="0.25"/></filter>
    
      
      <symbol id="acb" viewBox="0 0 100 110">
        <rect x="0" y="0" width="100" height="110" rx="3" fill="url(#dev)" stroke="#1f242b" strokeWidth="1"/>
        <rect x="6" y="6" width="88" height="20" rx="2" fill="#3a424d" stroke="#1f242b" strokeWidth="0.6"/>
        <rect x="10" y="10" width="40" height="12" fill="#1a1e24"/><text x="30" y="19" fontSize="7" fill="#9ae6b4" textAnchor="middle" fontFamily="monospace">ETU 1600A</text>
        <circle cx="66" cy="16" r="4" fill="#e53e3e"/><circle cx="78" cy="16" r="4" fill="#48bb78"/><circle cx="90" cy="16" r="3" fill="#ecc94b"/>
        <rect x="8" y="32" width="84" height="54" rx="2" fill="#4a535e" stroke="#1f242b" strokeWidth="0.6"/>
        <rect x="14" y="38" width="30" height="42" rx="2" fill="#2b323b"/><rect x="18" y="44" width="22" height="8" fill="#c53030"/><text x="29" y="50.5" fontSize="5.5" fill="#fff" textAnchor="middle" fontFamily="sans-serif">OFF</text>
        <rect x="18" y="56" width="22" height="8" fill="#2f855a"/><text x="29" y="62.5" fontSize="5.5" fill="#fff" textAnchor="middle" fontFamily="sans-serif">ON</text>
        <rect x="50" y="40" width="34" height="34" rx="17" fill="#3a424d" stroke="#1f242b" strokeWidth="0.6"/><rect x="64" y="42" width="6" height="30" rx="2" fill="#a0aec0"/>
        <rect x="8" y="90" width="84" height="12" rx="1.5" fill="#2b323b"/><text x="50" y="98.5" fontSize="6.5" fill="#e2e8f0" textAnchor="middle" fontFamily="sans-serif">SIEMENS 3WA</text>
        <rect x="0" y="104" width="100" height="6" fill="#8a94a0"/>
      </symbol>
      
      <symbol id="mccb" viewBox="0 0 40 60">
        <rect x="0" y="0" width="40" height="60" rx="2" fill="url(#dev)" stroke="#1f242b" strokeWidth="0.8"/>
        <g fill="#b8692a"><rect x="4" y="1" width="8" height="6"/><rect x="16" y="1" width="8" height="6"/><rect x="28" y="1" width="8" height="6"/><rect x="4" y="53" width="8" height="6"/><rect x="16" y="53" width="8" height="6"/><rect x="28" y="53" width="8" height="6"/></g>
        <rect x="6" y="12" width="28" height="36" rx="2" fill="#3a424d"/>
        <rect x="15" y="16" width="10" height="28" rx="2" fill="#1f242b"/><rect x="16.5" y="18" width="7" height="12" rx="1.5" fill="#cbd5e0"/>
        <rect x="8" y="37" width="24" height="7" fill="#2b323b"/><text x="20" y="42.5" fontSize="4.6" fill="#e2e8f0" textAnchor="middle" fontFamily="sans-serif">3VA</text>
      </symbol>
      
      <symbol id="mcb" viewBox="0 0 18 90">
        <rect x="0.5" y="0" width="17" height="90" rx="1.5" fill="#e6e8eb" stroke="#8a94a0" strokeWidth="0.8"/>
        <rect x="4" y="30" width="10" height="30" rx="1.5" fill="#2d3748"/><rect x="5.5" y="33" width="7" height="12" rx="1" fill="#a0aec0"/>
        <rect x="3" y="8" width="12" height="10" fill="#cbd5e0"/><rect x="3" y="72" width="12" height="10" fill="#cbd5e0"/>
      </symbol>
      
      <symbol id="mfm" viewBox="0 0 96 96">
        <rect x="0" y="0" width="96" height="96" rx="4" fill="#1a202c" stroke="#000" strokeWidth="1"/>
        <rect x="10" y="12" width="76" height="46" rx="2" fill="#0b3d2e"/><text x="48" y="32" fontSize="14" fill="#9ae6b4" textAnchor="middle" fontFamily="monospace">415 V</text><text x="48" y="50" fontSize="12" fill="#9ae6b4" textAnchor="middle" fontFamily="monospace">1 248 A</text>
        <g fill="#4a5568"><rect x="12" y="68" width="14" height="14" rx="2"/><rect x="34" y="68" width="14" height="14" rx="2"/><rect x="56" y="68" width="14" height="14" rx="2"/></g>
      </symbol>
      
      <symbol id="contactor" viewBox="0 0 45 80">
        <rect x="0" y="0" width="45" height="80" rx="2" fill="#4a5568" stroke="#1f242b" strokeWidth="0.8"/>
        <g fill="#b8692a"><rect x="5" y="2" width="8" height="8"/><rect x="18.5" y="2" width="8" height="8"/><rect x="32" y="2" width="8" height="8"/><rect x="5" y="70" width="8" height="8"/><rect x="18.5" y="70" width="8" height="8"/><rect x="32" y="70" width="8" height="8"/></g>
        <rect x="8" y="18" width="29" height="44" rx="2" fill="#2d3748"/><rect x="17" y="30" width="11" height="8" fill="#a0aec0"/>
      </symbol>
      
      <symbol id="cap" viewBox="0 0 75 150">
        <rect x="0" y="0" width="75" height="150" rx="10" fill="url(#devL)" stroke="#4a5568" strokeWidth="1"/>
        <rect x="12" y="20" width="51" height="28" rx="2" fill="#e2e8f0"/><text x="37.5" y="38" fontSize="12" fill="#2d3748" textAnchor="middle" fontFamily="sans-serif">50 kvar</text>
        <g fill="#b8692a"><rect x="12" y="2" width="12" height="8"/><rect x="31" y="2" width="12" height="8"/><rect x="50" y="2" width="12" height="8"/></g>
      </symbol>
      
      <symbol id="lamp" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#2d3748"/><circle cx="11" cy="11" r="6.5" fill="#f56565"/><circle cx="9" cy="9" r="2" fill="#fed7d7" opacity="0.8"/></symbol>
    </defs>
  )
}
