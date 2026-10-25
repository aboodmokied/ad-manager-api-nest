'use client';

import * as React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Platform,
  UnifiedCampaignObjective,
  MetaSpecialAdCategoryEnum,
  dollarsToMicros,
  formatMicros,
  CurrencyCode,
  CurrencyMicros,
} from '@uacm/shared-types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Plus, Trash2, CheckCircle2, DollarSign } from 'lucide-react';
import { useWorkspace } from '../providers/workspace-provider';

// Zod Schema consuming rules and enums from @uacm/shared-types
export const HeadlineItemSchema = z.object({
  text: z
    .string()
    .min(1, 'Headline text is required')
    .max(30, 'Google headline cannot exceed 30 characters'),
});

export const DescriptionItemSchema = z.object({
  text: z
    .string()
    .min(1, 'Description text is required')
    .max(90, 'Google description cannot exceed 90 characters'),
});

export const CreateCampaignFormSchema = z.object({
  name: z
    .string()
    .min(3, 'Campaign name must be at least 3 characters')
    .max(100, 'Campaign name cannot exceed 100 characters'),
  objective: z.nativeEnum(UnifiedCampaignObjective),
  dailyBudgetDollars: z
    .string()
    .min(1, 'Daily budget is required')
    .refine((val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 1;
    }, 'Daily budget must be at least 1.00')
    .refine(
      (val) => /^\d+(\.\d{1,2})?$/.test(val),
      'Budget must be a valid monetary format (e.g. 50.00)',
    ),
  targetPlatforms: z
    .array(z.nativeEnum(Platform))
    .min(1, 'Select at least one platform'),
  googleOverrides: z.object({
    customerId: z
      .string()
      .regex(
        /^(\d{3}-\d{3}-\d{4}|\d{10})$/,
        'Invalid Google Customer ID format (e.g. 123-456-7890)',
      )
      .optional()
      .or(z.literal('')),
    headlines: z
      .array(HeadlineItemSchema)
      .min(3, 'Google RSA requires at least 3 headlines')
      .max(15, 'Google RSA allows at most 15 headlines'),
    descriptions: z
      .array(DescriptionItemSchema)
      .min(2, 'Google RSA requires at least 2 descriptions')
      .max(4, 'Google RSA allows at most 4 descriptions'),
  }),
  metaOverrides: z.object({
    adAccountId: z
      .string()
      .regex(/^act_\d+$/, 'Meta ad account ID must start with "act_"')
      .optional()
      .or(z.literal('')),
    specialAdCategory: MetaSpecialAdCategoryEnum,
    placements: z.object({
      facebookFeed: z.boolean(),
      instagramFeed: z.boolean(),
      instagramStories: z.boolean(),
      reels: z.boolean(),
    }),
  }),
});

export type CreateCampaignFormInput = z.infer<typeof CreateCampaignFormSchema>;

export interface CreateCampaignResult {
  name: string;
  objective: UnifiedCampaignObjective;
  dailyBudgetMicros: CurrencyMicros;
  dailyBudgetFormatted: string;
  targetPlatforms: Platform[];
  googleOverrides?: {
    customerId?: string;
    headlines: { text: string }[];
    descriptions: { text: string }[];
  };
  metaOverrides?: {
    adAccountId?: string;
    specialAdCategory: string;
    placements: Record<string, boolean>;
  };
}

export interface CreateCampaignFormProps {
  onSubmitSuccess?: (result: CreateCampaignResult) => void;
  initialValues?: Partial<CreateCampaignFormInput>;
}

export function CreateCampaignForm({
  onSubmitSuccess,
  initialValues,
}: CreateCampaignFormProps) {
  const { activeWorkspace } = useWorkspace();
  const [submissionSuccess, setSubmissionSuccess] =
    React.useState<CreateCampaignResult | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateCampaignFormInput>({
    resolver: zodResolver(CreateCampaignFormSchema),
    defaultValues: {
      name: initialValues?.name || '',
      objective:
        initialValues?.objective || UnifiedCampaignObjective.LEAD_GENERATION,
      dailyBudgetDollars: initialValues?.dailyBudgetDollars || '25.00',
      targetPlatforms: initialValues?.targetPlatforms || [
        Platform.META,
        Platform.GOOGLE,
      ],
      googleOverrides: {
        customerId:
          initialValues?.googleOverrides?.customerId || '123-456-7890',
        headlines: initialValues?.googleOverrides?.headlines || [
          { text: 'Scale Your Conversions' },
          { text: 'Top Rated Marketing Suite' },
          { text: 'Get Started Today' },
        ],
        descriptions: initialValues?.googleOverrides?.descriptions || [
          {
            text: 'Automate multi-platform ad spend across Meta and Google Ads seamlessly.',
          },
          {
            text: 'Unified reporting with zero cumulative layout shift and real-time sync.',
          },
        ],
      },
      metaOverrides: {
        adAccountId:
          initialValues?.metaOverrides?.adAccountId || 'act_987654321',
        specialAdCategory:
          initialValues?.metaOverrides?.specialAdCategory || 'NONE',
        placements: {
          facebookFeed: true,
          instagramFeed: true,
          instagramStories: true,
          reels: true,
        },
      },
    },
  });

  const {
    fields: headlineFields,
    append: appendHeadline,
    remove: removeHeadline,
  } = useFieldArray({
    control,
    name: 'googleOverrides.headlines',
  });

  const {
    fields: descriptionFields,
    append: appendDescription,
    remove: removeDescription,
  } = useFieldArray({
    control,
    name: 'googleOverrides.descriptions',
  });

  const watchedBudget = watch('dailyBudgetDollars');
  const watchedPlatforms = watch('targetPlatforms') || [];
  const watchedHeadlines = watch('googleOverrides.headlines') || [];
  const watchedDescriptions = watch('googleOverrides.descriptions') || [];

  // Convert budget to micros and formatted display
  const previewMicros = React.useMemo(() => {
    try {
      const num = parseFloat(watchedBudget);
      if (isNaN(num) || num < 0) return 0n;
      return dollarsToMicros(watchedBudget);
    } catch {
      return 0n;
    }
  }, [watchedBudget]);

  const togglePlatform = (platform: Platform) => {
    const current = watchedPlatforms;
    const exists = current.includes(platform);
    if (exists) {
      if (current.length > 1) {
        setValue(
          'targetPlatforms',
          current.filter((p) => p !== platform),
        );
      }
    } else {
      setValue('targetPlatforms', [...current, platform]);
    }
  };

  const onSubmit = (data: CreateCampaignFormInput) => {
    // Financial precision conversion: Float string -> BigInt micros
    const budgetMicros = dollarsToMicros(data.dailyBudgetDollars);
    const formatted = formatMicros(
      budgetMicros,
      activeWorkspace.baseCurrency as CurrencyCode,
    );

    const result: CreateCampaignResult = {
      name: data.name,
      objective: data.objective,
      dailyBudgetMicros: budgetMicros,
      dailyBudgetFormatted: formatted,
      targetPlatforms: data.targetPlatforms,
      googleOverrides: data.targetPlatforms.includes(Platform.GOOGLE)
        ? {
            customerId: data.googleOverrides.customerId || undefined,
            headlines: data.googleOverrides.headlines,
            descriptions: data.googleOverrides.descriptions,
          }
        : undefined,
      metaOverrides: data.targetPlatforms.includes(Platform.META)
        ? {
            adAccountId: data.metaOverrides.adAccountId || undefined,
            specialAdCategory: data.metaOverrides.specialAdCategory,
            placements: data.metaOverrides.placements,
          }
        : undefined,
    };

    setSubmissionSuccess(result);
    onSubmitSuccess?.(result);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      data-testid="create-campaign-form"
    >
      {submissionSuccess && (
        <div
          data-testid="form-success-banner"
          className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">
              Campaign Validated & Staged Successfully
            </p>
            <p className="text-xs opacity-90">
              Budget: {submissionSuccess.dailyBudgetFormatted} (
              {submissionSuccess.dailyBudgetMicros.toString()} micros)
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Core Settings */}
      <Card>
        <CardHeader>
          <CardTitle>1. Campaign Core Settings</CardTitle>
          <CardDescription>
            Basic unified campaign parameters applied across all selected
            platforms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Campaign Name */}
          <div className="space-y-1.5 text-start">
            <Label htmlFor="campaign-name">Campaign Name *</Label>
            <Input
              id="campaign-name"
              placeholder="e.g. Q4 Black Friday Lead Boost"
              {...register('name')}
              aria-invalid={!!errors.name}
              data-testid="input-campaign-name"
            />
            {errors.name && (
              <p
                className="text-xs text-destructive"
                data-testid="error-campaign-name"
              >
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Campaign Objective */}
          <div className="space-y-1.5 text-start">
            <Label htmlFor="campaign-objective">Campaign Objective *</Label>
            <select
              id="campaign-objective"
              {...register('objective')}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="select-campaign-objective"
            >
              {Object.values(UnifiedCampaignObjective).map((obj) => (
                <option
                  key={obj}
                  value={obj}
                  className="bg-background text-foreground"
                >
                  {obj.replace('_', ' ')}
                </option>
              ))}
            </select>
            {errors.objective && (
              <p className="text-xs text-destructive">
                {errors.objective.message}
              </p>
            )}
          </div>

          {/* Daily Budget with Micros preview */}
          <div className="space-y-1.5 text-start">
            <div className="flex items-center justify-between">
              <Label htmlFor="daily-budget">
                Daily Budget ({activeWorkspace.baseCurrency}) *
              </Label>
              <span className="text-xs text-muted-foreground font-mono">
                Micros: {previewMicros.toString()}
              </span>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
              </div>
              <Input
                id="daily-budget"
                type="text"
                placeholder="25.00"
                className="ps-9 font-mono"
                {...register('dailyBudgetDollars')}
                aria-invalid={!!errors.dailyBudgetDollars}
                data-testid="input-daily-budget"
              />
            </div>
            {errors.dailyBudgetDollars && (
              <p
                className="text-xs text-destructive"
                data-testid="error-daily-budget"
              >
                {errors.dailyBudgetDollars.message}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Stored strictly in BigInt micros (1 unit = 1,000,000 micros). Zero
              floating-point representation.
            </p>
          </div>

          {/* Platform Selection */}
          <div className="space-y-2 text-start">
            <Label>Target Platforms *</Label>
            <div
              className="flex flex-wrap gap-2"
              data-testid="platform-selector"
            >
              {[
                Platform.META,
                Platform.GOOGLE,
                Platform.TIKTOK,
                Platform.SNAPCHAT,
              ].map((plat) => {
                const isSelected = watchedPlatforms.includes(plat);
                return (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => togglePlatform(plat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent'
                    }`}
                    data-testid={`platform-toggle-${plat.toLowerCase()}`}
                  >
                    {plat}
                  </button>
                );
              })}
            </div>
            {errors.targetPlatforms && (
              <p
                className="text-xs text-destructive"
                data-testid="error-target-platforms"
              >
                {errors.targetPlatforms.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Platform Specific Overrides Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>2. Platform Custom Overrides</CardTitle>
          <CardDescription>
            Fine-tune specifications for Google Responsive Search Ads and Meta
            ad delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="google">
            <TabsList className="mb-4">
              <TabsTrigger value="google">Google Ads Overrides</TabsTrigger>
              <TabsTrigger value="meta">Meta Ads Overrides</TabsTrigger>
            </TabsList>

            {/* Google Ads Overrides Tab */}
            <TabsContent value="google" className="space-y-4">
              {/* Customer ID */}
              <div className="space-y-1.5 text-start">
                <Label htmlFor="google-customer-id">
                  Google Customer ID (CID)
                </Label>
                <Input
                  id="google-customer-id"
                  placeholder="123-456-7890"
                  {...register('googleOverrides.customerId')}
                  data-testid="input-google-cid"
                />
                {errors.googleOverrides?.customerId && (
                  <p className="text-xs text-destructive">
                    {errors.googleOverrides.customerId.message}
                  </p>
                )}
              </div>

              {/* RSA Headlines (3 to 15 items, max 30 chars each) */}
              <div className="space-y-2 text-start">
                <div className="flex items-center justify-between">
                  <Label>
                    RSA Headlines ({headlineFields.length}/15, min 3) *
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendHeadline({ text: '' })}
                    disabled={headlineFields.length >= 15}
                    data-testid="add-headline-btn"
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Headline
                  </Button>
                </div>
                {errors.googleOverrides?.headlines?.message && (
                  <p
                    className="text-xs text-destructive"
                    data-testid="error-headlines-root"
                  >
                    {errors.googleOverrides.headlines.message}
                  </p>
                )}

                <div className="space-y-2">
                  {headlineFields.map((field, index) => {
                    const text = watchedHeadlines[index]?.text || '';
                    const remaining = 30 - text.length;
                    const isExceeded = remaining < 0;
                    const error =
                      errors.googleOverrides?.headlines?.[index]?.text;

                    return (
                      <div key={field.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              placeholder={`Headline ${index + 1} (max 30 chars)`}
                              {...register(
                                `googleOverrides.headlines.${index}.text`,
                              )}
                              className={
                                isExceeded
                                  ? 'border-destructive focus-visible:ring-destructive'
                                  : ''
                              }
                              data-testid={`headline-input-${index}`}
                            />
                            <span
                              className={`absolute end-2 top-2 text-[10px] font-mono ${
                                isExceeded
                                  ? 'text-destructive font-bold'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {text.length}/30
                            </span>
                          </div>
                          {headlineFields.length > 3 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeHeadline(index)}
                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              data-testid={`remove-headline-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {error && (
                          <p
                            className="text-xs text-destructive"
                            data-testid={`headline-error-${index}`}
                          >
                            {error.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RSA Descriptions (2 to 4 items, max 90 chars each) */}
              <div className="space-y-2 text-start pt-2">
                <div className="flex items-center justify-between">
                  <Label>
                    RSA Descriptions ({descriptionFields.length}/4, min 2) *
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendDescription({ text: '' })}
                    disabled={descriptionFields.length >= 4}
                    data-testid="add-description-btn"
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Description
                  </Button>
                </div>
                {errors.googleOverrides?.descriptions?.message && (
                  <p
                    className="text-xs text-destructive"
                    data-testid="error-descriptions-root"
                  >
                    {errors.googleOverrides.descriptions.message}
                  </p>
                )}

                <div className="space-y-2">
                  {descriptionFields.map((field, index) => {
                    const text = watchedDescriptions[index]?.text || '';
                    const remaining = 90 - text.length;
                    const isExceeded = remaining < 0;
                    const error =
                      errors.googleOverrides?.descriptions?.[index]?.text;

                    return (
                      <div key={field.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              placeholder={`Description ${index + 1} (max 90 chars)`}
                              {...register(
                                `googleOverrides.descriptions.${index}.text`,
                              )}
                              className={
                                isExceeded
                                  ? 'border-destructive focus-visible:ring-destructive'
                                  : ''
                              }
                              data-testid={`description-input-${index}`}
                            />
                            <span
                              className={`absolute end-2 top-2 text-[10px] font-mono ${
                                isExceeded
                                  ? 'text-destructive font-bold'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {text.length}/90
                            </span>
                          </div>
                          {descriptionFields.length > 2 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeDescription(index)}
                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              data-testid={`remove-description-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {error && (
                          <p
                            className="text-xs text-destructive"
                            data-testid={`description-error-${index}`}
                          >
                            {error.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* Meta Ads Overrides Tab */}
            <TabsContent value="meta" className="space-y-4">
              {/* Meta Ad Account ID */}
              <div className="space-y-1.5 text-start">
                <Label htmlFor="meta-ad-account-id">Meta Ad Account ID</Label>
                <Input
                  id="meta-ad-account-id"
                  placeholder="act_123456789"
                  {...register('metaOverrides.adAccountId')}
                  data-testid="input-meta-act-id"
                />
                {errors.metaOverrides?.adAccountId && (
                  <p className="text-xs text-destructive">
                    {errors.metaOverrides.adAccountId.message}
                  </p>
                )}
              </div>

              {/* Special Ad Category */}
              <div className="space-y-1.5 text-start">
                <Label htmlFor="meta-special-category">
                  Special Ad Category *
                </Label>
                <select
                  id="meta-special-category"
                  {...register('metaOverrides.specialAdCategory')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {Object.values(MetaSpecialAdCategoryEnum.options).map(
                    (cat) => (
                      <option
                        key={cat}
                        value={cat}
                        className="bg-background text-foreground"
                      >
                        {cat}
                      </option>
                    ),
                  )}
                </select>
              </div>

              {/* Placement Toggles */}
              <div className="space-y-2 text-start pt-2">
                <Label>Automatic Advantage+ Placements</Label>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer border p-2.5 rounded-lg hover:bg-accent/50">
                    <input
                      type="checkbox"
                      className="rounded border-border text-primary"
                      {...register('metaOverrides.placements.facebookFeed')}
                    />
                    <span>Facebook Feed</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer border p-2.5 rounded-lg hover:bg-accent/50">
                    <input
                      type="checkbox"
                      className="rounded border-border text-primary"
                      {...register('metaOverrides.placements.instagramFeed')}
                    />
                    <span>Instagram Feed</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer border p-2.5 rounded-lg hover:bg-accent/50">
                    <input
                      type="checkbox"
                      className="rounded border-border text-primary"
                      {...register('metaOverrides.placements.instagramStories')}
                    />
                    <span>Instagram Stories</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer border p-2.5 rounded-lg hover:bg-accent/50">
                    <input
                      type="checkbox"
                      className="rounded border-border text-primary"
                      {...register('metaOverrides.placements.reels')}
                    />
                    <span>Reels & Short Video</span>
                  </label>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          data-testid="submit-campaign-btn"
          className="font-semibold px-8"
        >
          {isSubmitting ? 'Validating...' : 'Validate & Publish Campaign'}
        </Button>
      </div>
    </form>
  );
}
