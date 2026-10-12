import { useEffect, useState } from 'react';
import { classes } from '../classes';
import { PREVIEW_EXTENSIONS, extensionOf, fileType, reportPreviewURL, typeIcons } from '../format';
import FontPreview from './FontPreview';

// The preview of a file that a report names, a game resource or a GDA file, with a badge of its format. A font is
// drawn with itself.
export default function ReportThumbnail({
  file,
  name,
  revision,
  preview = true,
}: {
  /** The file's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  /** False when the file cannot be read, so no preview is requested. */
  preview?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [file, revision]);

  const extension = extensionOf(name);
  const type = fileType(extension);
  const shown = preview && !failed && PREVIEW_EXTENSIONS.includes(extension);

  return (
    <div className={classes('thumbnail', type, { dds: extension === 'dds' })}>
      {shown ? (
        <img src={reportPreviewURL(file, revision)} alt={`${name} preview`} loading="lazy" onError={() => setFailed(true)} />
      ) : type === 'font' && preview ? (
        <FontPreview file={file} name={name} revision={revision} />
      ) : (
        <div className={classes('generic-preview', type)}><i aria-hidden="true" className={classes('mdi', typeIcons[type])} /></div>
      )}
      {extension ? <span className="badge file-format">{extension.toUpperCase()}</span> : null}
    </div>
  );
}
