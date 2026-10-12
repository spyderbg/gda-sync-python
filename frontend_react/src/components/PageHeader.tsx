import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  links,
  linksRight,
  toolbar,
}: {
  title: string;
  links?: ReactNode;
  linksRight?: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <div className="row page-title-header">
      <div className="col-12">
        <div className="page-header">
          <h4 className="page-title">{title}</h4>
          <div className="quick-link-wrapper w-100 d-md-flex flex-md-wrap">
            <ul className="quick-links">{links}</ul>
            <ul className="quick-links ml-auto">{linksRight}</ul>
          </div>
        </div>
      </div>
      {toolbar != null && toolbar !== false ? (
        <div className="col-md-12">
          <div className="page-header-toolbar">{toolbar}</div>
        </div>
      ) : null}
    </div>
  );
}
