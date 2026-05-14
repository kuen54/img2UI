import { describe, it, expect } from 'vitest'
import { bboxIoU } from '@/lib/bbox-iou'

describe('bboxIoU', () => {
  it('returns 1 for identical boxes', () => {
    expect(bboxIoU([0.1, 0.1, 0.4, 0.4], [0.1, 0.1, 0.4, 0.4])).toBe(1)
  })

  it('returns 0 for disjoint boxes', () => {
    expect(bboxIoU([0, 0, 0.2, 0.2], [0.5, 0.5, 0.2, 0.2])).toBe(0)
  })

  it('returns ~0.143 for 50%-overlap boxes (1/7)', () => {
    // a=[0,0,2,2] b=[1,1,2,2] inter=1*1=1, union=4+4-1=7
    expect(bboxIoU([0, 0, 2, 2], [1, 1, 2, 2])).toBeCloseTo(1 / 7, 3)
  })

  it('returns 0.25 when smaller box fully inside larger (1/4)', () => {
    // a=[0,0,2,2] b=[0,0,1,1] inter=1, union=4
    expect(bboxIoU([0, 0, 2, 2], [0, 0, 1, 1])).toBe(0.25)
  })

  it('returns 0 for zero-area degenerate input', () => {
    expect(bboxIoU([0, 0, 0, 0], [0, 0, 1, 1])).toBe(0)
  })
})
