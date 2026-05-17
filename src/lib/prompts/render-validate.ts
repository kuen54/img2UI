// HANDOFF §6.4 反向校验 prompt 渲染。

import type { LayoutElement } from '../types'

const VALIDATE_SYSTEM = `You are a quality validator. Given an extracted transparent PNG and the
expected element list, evaluate each element's extraction quality.

Output strict JSON:

{
  "elements": [{
    "entity_name": string,
    "complete": boolean,
    "alpha_quality": number,
    "style_match": number,
    "contamination": boolean,
    "notes": string
  }]
}`

export interface ValidatePromptInput {
  elements: LayoutElement[]
}

export function renderValidateSystemPrompt(): string {
  return VALIDATE_SYSTEM
}

export function renderValidateUserText(input: ValidatePromptInput): string {
  const expected = input.elements.map((el) => ({
    entity_name: el.name,
    description: el.description,
    type: el.type,
    visual_category: el.visual_category,
  }))
  return [
    `Expected elements: ${JSON.stringify(expected, null, 2)}`,
    '',
    'Validate each element against the keyed PNG. Return strict JSON.',
  ].join('\n')
}

export interface ParsedValidateElement {
  entity_name: string
  complete: boolean
  alpha_quality: number
  style_match: number
  contamination: boolean
  notes: string
}

export function parseValidateResponse(text: string): ParsedValidateElement[] {
  const trimmed = text.trim()
  const stripped = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const body = stripped && stripped[1] ? stripped[1].trim() : trimmed
  try {
    const parsed = JSON.parse(body) as { elements?: ParsedValidateElement[] }
    return parsed.elements ?? []
  } catch {
    return []
  }
}
