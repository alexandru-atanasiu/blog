// Minimal HLSL grammar for highlight.js (which ships GLSL but not HLSL).
// Covers .hlsl / .fx style shaders: types, keywords, intrinsics, semantics, preprocessor.

const SCALARS = ['bool', 'int', 'uint', 'dword', 'half', 'float', 'double', 'min16float', 'min10float', 'min16int', 'min12int', 'min16uint'];
const VECTOR_BASES = ['bool', 'int', 'uint', 'half', 'float', 'double'];

const TYPES = [
  ...SCALARS,
  ...VECTOR_BASES.flatMap((t) => [1, 2, 3, 4].map((n) => `${t}${n}`)),
  ...VECTOR_BASES.flatMap((t) => [1, 2, 3, 4].flatMap((r) => [1, 2, 3, 4].map((c) => `${t}${r}x${c}`))),
  'void', 'string', 'vector', 'matrix',
  'sampler', 'sampler1D', 'sampler2D', 'sampler3D', 'samplerCUBE', 'sampler_state',
  'SamplerState', 'SamplerComparisonState',
  'texture', 'Texture1D', 'Texture1DArray', 'Texture2D', 'Texture2DArray', 'Texture2DMS',
  'Texture2DMSArray', 'Texture3D', 'TextureCube', 'TextureCubeArray',
  'RWTexture1D', 'RWTexture2D', 'RWTexture2DArray', 'RWTexture3D',
  'Buffer', 'RWBuffer', 'ByteAddressBuffer', 'RWByteAddressBuffer',
  'StructuredBuffer', 'RWStructuredBuffer', 'AppendStructuredBuffer', 'ConsumeStructuredBuffer',
  'ConstantBuffer', 'RaytracingAccelerationStructure',
  'PointStream', 'LineStream', 'TriangleStream', 'InputPatch', 'OutputPatch',
];

const KEYWORDS = [
  'break', 'case', 'cbuffer', 'centroid', 'class', 'column_major', 'compile', 'const', 'continue',
  'default', 'discard', 'do', 'else', 'export', 'extern', 'for', 'if', 'in', 'inline', 'inout',
  'interface', 'linear', 'namespace', 'nointerpolation', 'noperspective', 'out', 'packoffset',
  'pass', 'precise', 'register', 'return', 'row_major', 'sample', 'shared', 'static', 'struct',
  'switch', 'tbuffer', 'technique', 'technique10', 'technique11', 'typedef', 'uniform',
  'volatile', 'while',
];

const BUILT_INS = [
  'abs', 'acos', 'all', 'any', 'asfloat', 'asin', 'asint', 'asuint', 'atan', 'atan2', 'ceil',
  'clamp', 'clip', 'cos', 'cosh', 'countbits', 'cross', 'ddx', 'ddx_coarse', 'ddx_fine', 'ddy',
  'ddy_coarse', 'ddy_fine', 'degrees', 'determinant', 'distance', 'dot', 'exp', 'exp2',
  'faceforward', 'firstbithigh', 'firstbitlow', 'floor', 'fma', 'fmod', 'frac', 'frexp', 'fwidth',
  'isfinite', 'isinf', 'isnan', 'ldexp', 'length', 'lerp', 'lit', 'log', 'log10', 'log2', 'mad',
  'max', 'min', 'modf', 'mul', 'noise', 'normalize', 'pow', 'radians', 'rcp', 'reflect',
  'refract', 'reversebits', 'round', 'rsqrt', 'saturate', 'sign', 'sin', 'sincos', 'sinh',
  'smoothstep', 'sqrt', 'step', 'tan', 'tanh', 'tex1D', 'tex2D', 'tex2Dbias', 'tex2Dgrad',
  'tex2Dlod', 'tex2Dproj', 'tex3D', 'texCUBE', 'texCUBElod', 'transpose', 'trunc',
  'Sample', 'SampleBias', 'SampleCmp', 'SampleCmpLevelZero', 'SampleGrad', 'SampleLevel',
  'Load', 'Gather', 'GetDimensions',
];

export default function hlsl(hljs) {
  return {
    name: 'HLSL',
    aliases: ['fx', 'fxh', 'hlsli'],
    keywords: {
      keyword: KEYWORDS,
      type: TYPES,
      built_in: BUILT_INS,
      literal: ['true', 'false', 'NULL'],
    },
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.QUOTE_STRING_MODE,
      hljs.C_NUMBER_MODE,
      { className: 'meta', begin: /^\s*#\s*[a-z]+\b/, end: /$/, contains: [hljs.C_LINE_COMMENT_MODE, hljs.C_BLOCK_COMMENT_MODE] },
      // Semantics: `: SV_Position`, `: TEXCOORD0`
      {
        className: 'symbol',
        match: /(?<=:\s*)(?:SV_\w+|(?:POSITION|POSITIONT|TEXCOORD|COLOR|NORMAL|TANGENT|BINORMAL|BLENDWEIGHT|BLENDINDICES|PSIZE|FOG|DEPTH|VFACE|VPOS)\d*)\b/,
      },
    ],
  };
}
