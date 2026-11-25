---
title: "Hello, world (sample post)"
date: 2026-11-25
description: A sample post that exercises every feature of the blog pipeline. Safe to delete once the first real article is up.
tags: [meta, sample]
---

> **This is a sample post.** It exists to check that the blog pipeline works end to end:
> headings, code blocks, tables, images and links. Delete it (or mark it `draft: true`) once
> there is a real article to replace it.

## How this blog is built

Every article is a Markdown file in the `posts/` folder. A small build script turns those
files into static HTML in `dist/`, and a GitHub Actions workflow publishes that folder to
[GitHub Pages](https://pages.github.com/).

![Markdown files are built into dist/ and deployed to GitHub Pages](images/hello-world/pipeline.svg)

Links between pages are written as links between Markdown files, for example the
[About page](../pages/about.md), and are rewritten at build time.

## Code blocks

Fenced code blocks are highlighted at build time, so no JavaScript runs in the reader's
browser. Inline code such as `deltaTime` works too.

### C#

```csharp
public sealed class FixedTimestep
{
    private const double Step = 1.0 / 60.0;
    private double _accumulator;

    public void Advance(double deltaTime, Action<double> simulate)
    {
        _accumulator += Math.Min(deltaTime, 0.25); // avoid the spiral of death
        while (_accumulator >= Step)
        {
            simulate(Step);
            _accumulator -= Step;
        }
    }
}
```

### C++

```cpp
#include <cstdint>
#include <vector>

template <typename T>
class SparseSet {
public:
    bool contains(std::uint32_t id) const {
        return id < sparse_.size() && sparse_[id] < dense_.size() && dense_[sparse_[id]] == id;
    }

private:
    std::vector<std::uint32_t> sparse_;
    std::vector<std::uint32_t> dense_;
    std::vector<T> values_;
};
```

### TypeScript

```ts
type Vec2 = { x: number; y: number };

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
```

### Shaders

```hlsl
Texture2D SpriteTexture : register(t0);
SamplerState SpriteSampler : register(s0);

float4 MainPS(float4 position : SV_Position, float4 color : COLOR0, float2 uv : TEXCOORD0) : SV_Target
{
    float4 texel = SpriteTexture.Sample(SpriteSampler, uv);
    return lerp(texel, texel * color, 0.5);
}
```

```glsl
#version 330 core
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;

void main() {
    fragColor = texture(uTexture, vUv);
}
```

### Shell

```bash
npm ci
npm run build   # writes the site to dist/
```

## Tables

| Fence tag          | Language   | Typical use            |
| ------------------ | ---------- | ---------------------- |
| `csharp`, `cs`     | C#         | Gameplay, tools        |
| `cpp`, `c++`       | C++        | Engine code            |
| `ts`, `js`         | TypeScript | Web tooling            |
| `hlsl`, `glsl`     | Shaders    | Rendering              |
| `bash`, `sh`       | Shell      | Build and CI snippets  |

## That's it

If you can read this page with styled code, a table and a diagram, the pipeline works.
