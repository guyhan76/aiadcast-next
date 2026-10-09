// Configuration is server-owned. Actual provider adapters are intentionally absent.
const capabilities = ['image-background', 'image-product-concept', 'image-ad-creative', 'image-region', 'translate-copy', 'video-from-product'];
export class ModelRouter {
  constructor(models = []) {
    this.models = new Map(models.map(model => [model.revision, Object.freeze({ ...model, capabilities: [...model.capabilities] })]));
  }
  pin({ revision, capability, preserveProduct = true }) {
    const model = this.models.get(revision);
    if (!model || !model.enabled || !model.evaluationPassed) throw Error('Model is not released');
    if (!capabilities.includes(capability) || !model.capabilities.includes(capability)) throw Error('Unsupported capability');
    if (preserveProduct && ['image-product-concept','image-ad-creative'].includes(capability)) throw Error('A new concept cannot promise original product identity');
    if (preserveProduct && ['image-background','image-region'].includes(capability) && !model.backgroundOnly) throw Error('Original product must be composited separately');
    if (preserveProduct && capability === 'video-from-product' && !model.preservesSourceFrames) throw Error('Generative video requires identity validation; use source-photo motion first');
    return Object.freeze({ provider: model.provider, modelId: model.modelId, revision: model.revision, capability, adapterVersion: model.adapterVersion, evaluationVersion: model.evaluationVersion });
  }
}
// Empty by default: no hard-coded "latest" model, no hidden paid API call.
export const productionModels = new ModelRouter();
