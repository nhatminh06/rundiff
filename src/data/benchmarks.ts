export interface DemoWorkload {
  id: string
  name: string
  description: string
  baseline: readonly number[]
  candidate: readonly number[]
}

export interface DemoDataset {
  id: string
  name: string
  context: string
  baselineLabel: string
  candidateLabel: string
  workloads: readonly DemoWorkload[]
  synthetic: boolean
}

export const demoDatasets: readonly DemoDataset[] = [
  {
    id: 'compiler-main', name: 'Compiler optimization · main → PR #284', context: 'Linux x86_64 · 8 vCPU · release build', baselineLabel: 'main @ 48f2c1a', candidateLabel: 'PR #284 @ 91a8d74', synthetic: true,
    workloads: [
      { id: 'small-gemm', name: 'Small GEMM', description: '128 × 128 FP32 matrix multiply', baseline: [1.18, 1.21, 1.19, 1.2, 1.17, 1.22, 1.19], candidate: [1.34, 1.31, 1.33, 1.35, 1.32, 1.34, 1.33] },
      { id: 'medium-gemm', name: 'Medium GEMM', description: '1024 × 1024 FP32 matrix multiply', baseline: [18.4, 18.7, 18.5, 18.6, 18.3, 18.5, 18.6], candidate: [16.9, 17.1, 17, 16.8, 17.2, 16.9, 17] },
      { id: 'conv2d', name: 'Conv2D', description: '3 × 3 convolution, 64 channels', baseline: [8.42, 8.38, 8.45, 8.4, 8.43, 8.39, 8.41], candidate: [8.44, 8.41, 8.46, 8.42, 8.4, 8.45, 8.43] },
    ],
  },
  {
    id: 'runtime-next', name: 'Runtime refactor · v0.9 → next', context: 'Linux ARM64 · 4 vCPU · release build', baselineLabel: 'v0.9.0', candidateLabel: 'next @ b17e20f', synthetic: true,
    workloads: [
      { id: 'small-gemm', name: 'Small GEMM', description: '128 × 128 FP32 matrix multiply', baseline: [1.62, 1.59, 1.61, 1.6, 1.63, 1.58], candidate: [1.53, 1.51, 1.52, 1.54, 1.5, 1.52] },
      { id: 'medium-gemm', name: 'Medium GEMM', description: '1024 × 1024 FP32 matrix multiply', baseline: [21.1, 21.3, 21.2, 21.4, 21, 21.2], candidate: [21.4, 21.2, 21.3, 21.5, 21.1, 21.3] },
      { id: 'conv2d', name: 'Conv2D', description: '3 × 3 convolution, 64 channels', baseline: [9.1, 9.2, 9.15, 9.18, 9.12, 9.16], candidate: [10.02, 10.1, 10.08, 10.04, 10.12, 10.06] },
    ],
  },
]
