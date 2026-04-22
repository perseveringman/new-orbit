import { describe, expect, it } from 'vitest';
import {
  getLeafWrapperStyle,
  getPrimarySplitSectionStyle,
  getSecondarySplitSectionStyle
} from '../src/renderer/src/components/Terminal/terminalLayout';

describe('terminal layout styles', () => {
  it('keeps row split sections shrinkable to avoid overflow feedback loops', () => {
    expect(getPrimarySplitSectionStyle(0.5)).toMatchObject({
      display: 'flex',
      minWidth: 0,
      minHeight: 0,
      overflow: 'hidden'
    });
    expect(getSecondarySplitSectionStyle()).toMatchObject({
      display: 'flex',
      minWidth: 0,
      minHeight: 0,
      overflow: 'hidden'
    });
  });

  it('keeps leaf wrappers shrinkable even when zoom is off', () => {
    expect(getLeafWrapperStyle(false)).toMatchObject({
      display: 'flex',
      flex: 1,
      minWidth: 0,
      minHeight: 0
    });
  });
});
