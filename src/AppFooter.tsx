import {BrandLogo} from './BrandLogo';
import './app-footer.css';

export function AppFooter({editor=false,note}:{editor?:boolean;note?:string}){
 return <footer className={`brand-footer ${editor?'editor-footer':'app-footer'}`}>
  <div className="footer-brand"><BrandLogo/><span className="footer-byline">by selluplabs</span></div>
  <a href="/account-deletion.html" target="_blank" rel="noreferrer">자료 보관 · 회원탈퇴</a>
  {note&&<p>{note}</p>}
 </footer>;
}
