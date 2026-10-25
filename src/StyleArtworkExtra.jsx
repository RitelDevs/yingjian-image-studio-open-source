import { useId } from 'react';

const EXTRA_IDS = new Set(['shinkai-scene', 'editorial-cover', 'knowledge-card', 'four-panel-comic', 'character-sheet', 'travel-poster', 'packaging-concept', 'scientific-schematic', 'photo-anime', 'photo-clay-avatar', 'product-white', 'product-lifestyle', 'photo-watercolor', 'photo-film', 'pet-felt', 'photo-restoration']);
export const hasExtraArtwork = id => EXTRA_IDS.has(id);

function Figure({ x, y, color, scale = 1, side = false }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M-21 48Q-27 11 0 10Q27 12 22 48L12 70H-13Z" fill={color} />
    <circle cy="-10" r="18" fill="#dfbb9c" />
    <path d="M-18-9Q-22-40 8-29Q25-22 18-6L10-15-7-11Z" fill="#374452" />
    {!side && <><circle cx="-6" cy="-8" r="1.8" fill="#374452" /><circle cx="6" cy="-8" r="1.8" fill="#374452" /></>}
    <path d="M-11 67-14 99M12 67 15 99" stroke="#374452" strokeWidth="11" strokeLinecap="round" />
  </g>;
}
function Bottle({ x = 200, y = 130, color, ink, label = true }) {
  return <g transform={`translate(${x} ${y})`}>
    <ellipse cy="120" rx="64" ry="10" fill={ink} fillOpacity=".1" />
    <rect x="-35" width="70" height="114" rx="15" fill={color} />
    <rect x="-24" y="-22" width="48" height="28" rx="5" fill={ink} />
    <path d="M-24 17V42" stroke="white" strokeOpacity=".75" strokeWidth="4" strokeLinecap="round" />
    {label && <><rect x="-29" y="53" width="58" height="36" rx="2" fill="white" fillOpacity=".85" /><path d="M-14 67H14M-9 77H9" stroke={ink} strokeWidth="2" /></>}
  </g>;
}
function Landscape({ ink, accent, uid, split = false }) {
  return <>
    <rect width="400" height="320" fill={`url(#${uid}-sky)`} />
    <g fill="white" fillOpacity=".75"><ellipse cx="104" cy="82" rx="66" ry="18" /><ellipse cx="79" cy="66" rx="35" ry="25" /><ellipse cx="287" cy="55" rx="74" ry="14" /></g>
    <circle cx="308" cy="127" r="26" fill="#ffe4bb" />
    <path d="M0 206 56 150 108 190 173 112 243 185 318 132 400 197V320H0Z" fill={accent} fillOpacity=".45" />
    <path d="M0 235 100 211 215 219 303 205 400 223V320H0Z" fill={ink} fillOpacity=".52" />
    <path d="M0 275 400 238V320H0Z" fill="#d8d7d4" />
    <path d="m0 298 400-37M0 278 400-38" stroke="white" strokeWidth="2" strokeOpacity=".6" />
    <g fill={ink}><rect x="28" y="170" width="38" height="75" /><rect x="69" y="181" width="44" height="61" /><rect x="334" y="162" width="49" height="70" /></g>
    <g fill="#ffe4bb">{[0, 1, 2].map(i => <g key={i}><rect x={35 + i * 9} y="183" width="4" height="6" /><rect x={342 + i * 11} y="178" width="5" height="7" /></g>)}</g>
    <Figure x={237} y={244} color="#d98d79" scale={.36} />
    <path d="M139 115V259M139 133 400 90" stroke={ink} strokeWidth="2" />
    {split && <><path d="M0 0H196V320H0Z" fill="#d1d6d9" fillOpacity=".34" /><path d="M198 20V300" stroke="white" strokeWidth="3" /><circle cx="198" cy="160" r="18" fill="white" /><path d="m190 160 5-5m-5 5 5 5m11-5-5-5m5 5-5 5" stroke={ink} strokeWidth="2" /></>}
  </>;
}

// Original vector previews show the type of task, never claimed as generated samples.
export default function StyleArtworkExtra({ style, className = '' }) {
  const uid = useId().replaceAll(':', '');
  const [paper, accent, ink] = style.cover.colors;
  const id = style.id;
  const photoScene = ['photo-anime', 'photo-watercolor', 'photo-film', 'photo-restoration'].includes(id);
  return <svg className={`style-artwork ${className}`} viewBox="0 0 400 320" fill="none" aria-hidden="true" focusable="false" data-artwork={id}>
    <defs><linearGradient id={`${uid}-sky`} x1="200" y1="0" x2="200" y2="320" gradientUnits="userSpaceOnUse"><stop stopColor={paper} /><stop offset=".68" stopColor={accent} /><stop offset="1" stopColor={paper} /></linearGradient></defs>
    <rect width="400" height="320" fill={paper} />
    {(id === 'shinkai-scene' || photoScene) && <><Landscape ink={ink} accent={accent} uid={uid} split={photoScene} />{id === 'photo-restoration' && <path d="m87 12 6 87-14 62 11 49-8 99M28 194l138-25M133 26l-6 110" stroke="white" strokeOpacity=".7" strokeWidth="2" />}{id === 'photo-watercolor' && <g fill={paper} fillOpacity=".55"><ellipse cx="9" cy="77" rx="18" ry="82" /><ellipse cx="385" cy="272" rx="38" ry="90" /></g>}</>}
    {id === 'editorial-cover' && <>
      <rect x="24" y="19" width="352" height="282" fill="#faf9f5" /><text x="45" y="69" fontSize="45" fontWeight="600" fill={ink} fontFamily="Outfit, sans-serif">CITY / 01</text>
      <rect x="45" y="87" width="310" height="162" fill={accent} fillOpacity=".18" />
      {[0, 1, 2, 3].map(i => <g key={i} transform={`translate(${65 + i * 69} 0)`}><path d={`M0 249V${137 - i * 12}L50 ${107 - i * 10}V249Z`} fill={ink} fillOpacity={.35 + i * .15} /><path d="M10 157V242M23 150V242M36 142V242" stroke={paper} strokeOpacity=".5" /></g>)}
      <path d="M45 269H193M45 280H129M279 270H355" stroke={ink} strokeWidth="3" />
    </>}
    {id === 'knowledge-card' && <>
      <rect x="31" y="25" width="338" height="270" rx="13" fill="white" fillOpacity=".85" /><rect x="50" y="44" width="149" height="13" rx="4" fill={ink} /><rect x="50" y="66" width="219" height="6" rx="3" fill={ink} fillOpacity=".3" />
      {[0, 1, 2, 3].map(i => <g key={i} transform={`translate(51 ${96 + i * 43})`}><rect width="29" height="29" rx="8" fill={accent} /><text x="14.5" y="20" textAnchor="middle" fontFamily="Outfit" fontSize="15" fontWeight="600" fill={ink}>{i + 1}</text><path d="M44 9H230M44 22H179" stroke={ink} strokeOpacity=".7" strokeWidth="4" strokeLinecap="round" /></g>)}
    </>}
    {id === 'four-panel-comic' && [0, 1, 2, 3].map(i => <g key={i} transform={`translate(${22 + i % 2 * 185} ${20 + Math.floor(i / 2) * 146})`}>
      <rect width="171" height="132" rx="5" fill="white" stroke={ink} strokeWidth="3" /><path d="M14 111H156" stroke={ink} strokeOpacity=".2" strokeWidth="2" />
      <rect x={i === 3 ? 69 : 93} y="77" width="51" height="34" fill={accent} fillOpacity=".65" />
      <g transform={`translate(${i === 3 ? 94 : 52 + i * 17} ${i === 3 ? 67 : 72})`}><ellipse cy="16" rx="22" ry="19" fill={ink} /><path d="M-18-3-18-21-5-13Q0-16 6-12L18-22 18-1Z" fill={ink} /><path d="M-8-2H-4M5-2H9" stroke="white" strokeWidth="2" /><path d="M19 17Q42 3 29-7" stroke={ink} strokeWidth="6" strokeLinecap="round" /></g>
    </g>)}
    {id === 'character-sheet' && <>
      <path d="M24 252H376M24 121H376" stroke={ink} strokeOpacity=".15" strokeDasharray="4 5" />
      {[0, 1, 2].map(i => <g key={i}><Figure x={80 + i * 120} y={139} color={accent} side={i === 1} scale={1.1} /><path d={`M${60 + i * 120} 283h40`} stroke={ink} strokeWidth="3" /></g>)}
      <text x="24" y="38" fontSize="11" letterSpacing="3" fill={ink} fontFamily="Outfit">CHARACTER STUDY</text>
    </>}
    {id === 'travel-poster' && <>
      <rect x="25" y="20" width="350" height="280" fill="#fffaf0" /><circle cx="298" cy="83" r="29" fill="#e8b765" />
      <path d="M43 198 123 94 183 157 240 81 356 197V270H43Z" fill={ink} /><path d="m123 94-26 33 25-9 22 6ZM240 81l-24 36 24-13 25 15Z" fill="white" />
      <path d="M43 202Q160 174 244 214T356 210V270H43Z" fill={accent} /><path d="M56 233H156M210 246H325" stroke="white" strokeOpacity=".5" />
      <text x="45" y="58" fontFamily="Outfit" fontSize="23" fontWeight="600" fill={ink}>WANDER</text>
    </>}
    {id === 'packaging-concept' && <>
      <path d="M0 253H400V320H0Z" fill={ink} fillOpacity=".05" /><path d="m133 104 101-16 56 24v152l-102 17-55-28Z" fill={accent} />
      <path d="m133 104 55 28 102-20-56-24Z" fill="#f3e6d4" /><path d="M188 132v149l102-17V112Z" fill={ink} fillOpacity=".35" />
      <path d="m150 143 20 10v63l-20-10Z" fill={paper} /><text x="209" y="182" transform="rotate(-9 209 182)" fill={paper} fontSize="20" fontFamily="Outfit" letterSpacing="2">FORM</text><path d="m209 218 57-9m-57 18 39-6" stroke={paper} strokeOpacity=".7" strokeWidth="2" />
    </>}
    {id === 'scientific-schematic' && <>
      <text x="26" y="41" fill={ink} fontSize="12" letterSpacing="2" fontFamily="Outfit">SYSTEM / FLOW</text>
      {[0, 1, 2].map(i => <g key={i}><rect x={24 + i * 129} y="119" width="94" height="77" rx="11" fill={i === 1 ? accent : 'white'} stroke={accent} strokeWidth="2" /><text x={71 + i * 129} y="163" textAnchor="middle" fill={i === 1 ? 'white' : ink} fontSize="12" fontFamily="Outfit">{['INPUT', 'PROCESS', 'OUTPUT'][i]}</text>{i < 2 && <path d={`M${121 + i * 129} 158h24m-7-5 7 5-7 5`} stroke={ink} strokeWidth="2" />}</g>)}
      <path d="M329 207v38H71v-37m-5 7 5-7 5 7" stroke={accent} strokeWidth="2" strokeDasharray="5 4" /><text x="175" y="271" fill={ink} fontSize="11" fontFamily="Outfit">FEEDBACK</text>
    </>}
    {(id === 'product-white' || id === 'product-lifestyle') && <>
      {id === 'product-lifestyle' && <><path d="M0 0H142V194H0Z" fill="white" fillOpacity=".7" /><path d="M70 0V194M0 98H142" stroke={ink} strokeOpacity=".2" strokeWidth="7" /><path d="M0 234H400V320H0Z" fill={accent} fillOpacity=".18" /><path d="m300 225 19-56 20 56Z" fill={ink} fillOpacity=".6" /></>}
      <Bottle color={accent} ink={ink} />
    </>}
    {(id === 'photo-clay-avatar' || id === 'pet-felt') && <>
      <ellipse cx="200" cy="277" rx="90" ry="12" fill={ink} fillOpacity=".13" />
      {id === 'photo-clay-avatar' ? <g><path d="M116 277q7-70 84-69 81 2 84 69" fill={accent} /><rect x="141" y="70" width="118" height="150" rx="57" fill="#e4bda0" /><path d="M141 133Q120 66 187 58Q277 47 259 139L231 105Q190 132 154 117Z" fill={ink} /><g stroke={ink} strokeWidth="4"><circle cx="174" cy="153" r="19" /><circle cx="225" cy="153" r="19" /><path d="M193 153H206" /></g><path d="M187 188q13 10 26 0" stroke={ink} strokeWidth="3" /></g> : <g><ellipse cx="201" cy="235" rx="67" ry="45" fill={accent} /><path d="M132 118 130 61l48 33q28-10 53 0l44-34 2 59q16 98-75 99-91-2-70-100Z" fill={accent} /><path d="m140 107-1-25 23 18m80 1 23-19-1 26" stroke={paper} strokeWidth="7" /><ellipse cx="175" cy="151" rx="7" ry="9" fill={ink} /><ellipse cx="230" cy="151" rx="7" ry="9" fill={ink} /><path d="m195 176 8 7 8-7Z" fill={ink} /><path d="M202 184v10m-22-72-6 9m69 69 8 6m-94 31 7 6" stroke={ink} strokeOpacity=".4" strokeWidth="2" /></g>}
    </>}
  </svg>;
}
