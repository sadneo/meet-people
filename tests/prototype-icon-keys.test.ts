// @vitest-environment node
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

describe('prototype icon registry', () => {
  it('defines every icon key once', () => {
    const source = ts.createSourceFile('ui.tsx', readFileSync(new URL('../src/features/prototype/ui.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const keys: string[] = []
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'paths' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        for (const property of node.initializer.properties) {
          if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) keys.push(property.name.text)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([])
  })
})
