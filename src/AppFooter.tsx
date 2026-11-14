import {BrandLogo} from './BrandLogo';
import './app-footer.css';

export function AppFooter(){
 return <footer className="brand-footer app-footer">
  <div className="footer-brand"><BrandLogo/><span className="footer-byline">by selluplabs</span></div>
 </footer>;
}
