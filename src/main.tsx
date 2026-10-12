import {SessionBoundary} from './BetaAccount';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/noto-sans-kr';
import '@fontsource-variable/noto-serif-kr';
import './lookbook-font.css';
import './style.css';
import './formats.css';
import App from './StudioApp';
import './brand-theme.css';
import {UiLanguageProvider} from './ui-language';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><UiLanguageProvider><SessionBoundary><App/></SessionBoundary></UiLanguageProvider></React.StrictMode>);

