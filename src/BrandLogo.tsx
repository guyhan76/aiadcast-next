import originalWordmark from './assets/aiadcast-wordmark.svg?raw';
import './brand-logo.css';
// The supplied outlines and fills are unchanged; trim only the empty SVG viewport.
const wordmark=originalWordmark.replace('viewBox="0 0 1179 341" width="1179" height="341"','viewBox="83.43 83.43 1013.14 174.6" width="1013.14" height="174.6" aria-hidden="true" focusable="false"');
export function BrandLogo(){return <span className="brand-lockup" role="img" aria-label="aiadcast" dangerouslySetInnerHTML={{__html:wordmark}}/>;}
