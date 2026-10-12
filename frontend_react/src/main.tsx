import { createRoot } from 'react-dom/client';
import '@fontsource-variable/roboto';
import './styles/icons.scss';
import './theme/staradmin/scss/shared/style.scss';
import './theme/staradmin/scss/demo_1/style.scss';
import './styles/app.scss';
import './styles/scoped.scss';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
