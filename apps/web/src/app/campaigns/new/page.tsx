'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { CreateCampaignForm } from '@/components/forms/CreateCampaignForm';
import { useDirection } from '@/components/providers/direction-provider';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { Button } from '@/components/ui/button';

export default function NewCampaignPage() {
  const { isRtl } = useDirection();
  const { activeWorkspace } = useWorkspace();

  return (
    <div
      className="max-w-4xl mx-auto space-y-6 animate-in fade-in-50 duration-200"
      data-testid="new-campaign-page"
    >
      {/* Back Button & Header */}
      <div className="flex items-center gap-3">
        <Link href="/campaigns">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
          >
            {isRtl ? (
              <ArrowRight className="h-5 w-5" />
            ) : (
              <ArrowLeft className="h-5 w-5" />
            )}
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isRtl
              ? 'إنشاء حملة إعلانية موحدة'
              : 'Create Multi-Platform Campaign'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRtl
              ? `تهيئة الحملة ونشرها تلقائياً عبر Meta و Google Ads في مساحة: ${activeWorkspace.name}`
              : `Configure and publish across Meta and Google Ads in ${activeWorkspace.name}`}
          </p>
        </div>
      </div>

      {/* Info Notice Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-primary">
            {isRtl
              ? 'معايير الدقة والامتثال الصارم'
              : 'Ad-Tech Financial & Policy Validation'}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isRtl
              ? 'تتم معالجة جميع الميزانيات بدقة الميكرو (BigInt Micros) بدون أرقام عشرية لمنع أخطاء التقريب. إعلانات Google RSA تتطلب من 3 إلى 15 عنواناً (بحد أقصى 30 حرفاً) ومن 2 إلى 4 أوصاف (بحد أقصى 90 حرفاً).'
              : 'All monetary values are converted to BigInt micros with zero floating-point math. Google RSA ads strictly require 3-15 headlines (<=30 chars) and 2-4 descriptions (<=90 chars) validated against @uacm/shared-types schemas.'}
          </p>
        </div>
      </div>

      {/* Form Card */}
      <CreateCampaignForm />
    </div>
  );
}
