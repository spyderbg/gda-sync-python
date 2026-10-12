import { size } from '../format';
import { useWorkspace } from '../workspace';

export default function AppFooter() {
  const { config, session, totalSize } = useWorkspace();
  return (
    <footer className="footer">
      <div className="container-fluid clearfix">
        <span className="text-muted d-block text-center text-sm-left d-sm-inline-block">EGT GDA Sync v{session.version} · Your files stay on this computer.</span>
        <span className="float-none float-sm-right d-block mt-1 mt-sm-0 text-center">{config.demo ? 'Demo workspace' : 'Connected workspace'} · {size(totalSize)} total</span>
      </div>
    </footer>
  );
}
