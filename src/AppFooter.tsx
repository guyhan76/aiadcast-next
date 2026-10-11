import {BrandLogo} from './BrandLogo';
import './app-footer.css';

export function AppFooter({editor=false,note}:{editor?:boolean;note?:string}){
 return <footer className={`brand-footer ${editor?'editor-footer':'app-footer'}`}>
  <div className="footer-brand"><BrandLogo/><span className="footer-byline">by selluplabs</span></div>
  {note&&<p>{note}</p>}
 </footer>;
}
