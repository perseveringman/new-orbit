import type React from 'react';

export function getLeafWrapperStyle(isZoomed: boolean): React.CSSProperties {
  if (isZoomed) {
    return {
      position: 'absolute',
      inset: 0,
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      minHeight: 0
    };
  }

  return {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0
  };
}

export function getPrimarySplitSectionStyle(ratio: number): React.CSSProperties {
  return {
    flexBasis: `${ratio * 100}%`,
    flexShrink: 0,
    display: 'flex',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden'
  };
}

export function getSecondarySplitSectionStyle(): React.CSSProperties {
  return {
    flex: 1,
    display: 'flex',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden'
  };
}
