import type {
  AiRegistryRepository,
  CreateProviderInput,
  UpdateProviderInput,
  UpsertBindingInput,
} from "@/modules/ai/data/ai-registry.repository";
import type { AiBindingView, AiProviderView } from "@/modules/ai/domain/types";

type ProviderRec = {
  id: string;
  orgId: string;
  provider: string;
  apiKeyEncrypted: string | null;
  defaultModel: string | null;
  enabled: boolean;
  createdAt: Date;
};

type BindingRec = {
  id: string;
  orgId: string;
  capability: string;
  provider: string;
  model: string | null;
  createdAt: Date;
};

// Fake fiel às invariantes da BD: único (org, provider) no create e upsert por
// (org, capability) nos bindings. Escopado por orgId como o repo Drizzle real.
export class FakeAiRegistryRepo implements AiRegistryRepository {
  providers: ProviderRec[] = [];
  bindings: BindingRec[] = [];
  private seq = 0;

  private nid(prefix: string): string {
    return `${prefix}-${++this.seq}`;
  }

  private toProviderView(r: ProviderRec): AiProviderView {
    return {
      id: r.id,
      provider: r.provider,
      defaultModel: r.defaultModel,
      enabled: r.enabled,
      hasKey: r.apiKeyEncrypted !== null,
      createdAt: r.createdAt,
    };
  }

  private toBindingView(r: BindingRec): AiBindingView {
    return {
      id: r.id,
      capability: r.capability,
      provider: r.provider,
      model: r.model,
      createdAt: r.createdAt,
    };
  }

  async listProviders(orgId: string): Promise<AiProviderView[]> {
    return this.providers
      .filter((p) => p.orgId === orgId)
      .sort((a, b) => a.provider.localeCompare(b.provider))
      .map((p) => this.toProviderView(p));
  }

  async getProviderByName(orgId: string, provider: string): Promise<AiProviderView | null> {
    const r = this.providers.find((p) => p.orgId === orgId && p.provider === provider);
    return r ? this.toProviderView(r) : null;
  }

  async createProvider(orgId: string, input: CreateProviderInput): Promise<AiProviderView> {
    const rec: ProviderRec = {
      id: this.nid("prov"),
      orgId,
      provider: input.provider,
      apiKeyEncrypted: input.apiKeyEncrypted,
      defaultModel: input.defaultModel,
      enabled: input.enabled,
      createdAt: new Date(),
    };
    this.providers.push(rec);
    return this.toProviderView(rec);
  }

  async updateProvider(
    id: string,
    orgId: string,
    patch: UpdateProviderInput,
  ): Promise<AiProviderView | null> {
    const rec = this.providers.find((p) => p.id === id && p.orgId === orgId);
    if (!rec) return null;
    if (patch.apiKeyEncrypted !== undefined) rec.apiKeyEncrypted = patch.apiKeyEncrypted;
    if (patch.defaultModel !== undefined) rec.defaultModel = patch.defaultModel;
    if (patch.enabled !== undefined) rec.enabled = patch.enabled;
    return this.toProviderView(rec);
  }

  async removeProvider(id: string, orgId: string): Promise<boolean> {
    const before = this.providers.length;
    this.providers = this.providers.filter((p) => !(p.id === id && p.orgId === orgId));
    return this.providers.length < before;
  }

  async listBindings(orgId: string): Promise<AiBindingView[]> {
    return this.bindings
      .filter((b) => b.orgId === orgId)
      .sort((a, b) => a.capability.localeCompare(b.capability))
      .map((b) => this.toBindingView(b));
  }

  async upsertBinding(orgId: string, input: UpsertBindingInput): Promise<AiBindingView> {
    const existing = this.bindings.find(
      (b) => b.orgId === orgId && b.capability === input.capability,
    );
    if (existing) {
      existing.provider = input.provider;
      existing.model = input.model;
      return this.toBindingView(existing);
    }
    const rec: BindingRec = {
      id: this.nid("bind"),
      orgId,
      capability: input.capability,
      provider: input.provider,
      model: input.model,
      createdAt: new Date(),
    };
    this.bindings.push(rec);
    return this.toBindingView(rec);
  }

  async removeBinding(id: string, orgId: string): Promise<boolean> {
    const before = this.bindings.length;
    this.bindings = this.bindings.filter((b) => !(b.id === id && b.orgId === orgId));
    return this.bindings.length < before;
  }
}
