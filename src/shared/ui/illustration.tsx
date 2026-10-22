export type IllustrationKind = 'parcel' | 'truck' | 'forklift' | 'warehouse';
export type IllustrationSize = 'small' | 'medium' | 'large';

/** Decorative artwork: never carries information required to use the page. */
export function Illustration({ kind = 'parcel', size = 'medium', className = '' }: {
  kind?: IllustrationKind;
  size?: IllustrationSize;
  className?: string;
}) {
  return <img src={`/illustrations/${kind}.svg`} alt="" aria-hidden="true"
    width={320} height={200} draggable={false}
    className={`pc-illustration pc-illustration--${size} ${className}`} />;
}
