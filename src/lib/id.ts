import { customAlphabet } from 'nanoid'

const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export const nid6 = customAlphabet(alpha, 6)
export const nid8 = customAlphabet(alpha, 8)

export const newProviderId = () => `prv_${nid6()}`
export const newProjectId = () => `proj_${nid8()}`
export const newPageId = () => `page_${nid8()}`
export const newStateId = () => `state_${nid8()}`
export const newElementId = () => `el_${nid8()}`
export const newAssetId = () => `asset_${nid8()}`
export const newRunId = () => `run_${nid8()}`
