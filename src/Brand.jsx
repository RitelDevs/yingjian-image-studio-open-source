export default function Brand({ compact = false }) {
  return <span className="brand" aria-label="映间">
    <svg className="brand-mark" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M2 12V2h10M20 2h10v10M30 20v10H20M12 30H2V20" stroke="currentColor" strokeWidth="3" /><path d="M10 22V10h12" stroke="currentColor" strokeWidth="3" /><path d="m10 22 12-12" stroke="currentColor" strokeWidth="3" /></svg>
    {!compact && <span className="brand-name">映间<span>IMAGE STUDIO</span></span>}
  </span>;
}
