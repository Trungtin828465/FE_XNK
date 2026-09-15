"use client";

import { useLanguage } from "@/context/LanguageContext";

const GUIDE_STEPS = [
  ["guideStepCreateTitle", "guideStepCreateBody"],
  ["guideStepReviewTitle", "guideStepReviewBody"],
  ["guideStepDocumentsTitle", "guideStepDocumentsBody"],
  ["guideStepBillTitle", "guideStepBillBody"],
  ["guideStepJourneyTitle", "guideStepJourneyBody"],
  ["guideStepTransportTitle", "guideStepTransportBody"],
] as const;

const IMPORTANT_NOTES = [
  "guideImportantPdf",
  "guideImportantReview",
  "guideImportantItems",
  "guideImportantContainers",
] as const;

export default function UserGuidePage() {
  const { t } = useLanguage();

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white p-5 dark:border-brand-500/20 dark:from-brand-500/10 dark:to-white/[0.02] sm:p-7">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("userGuideTitle")}</h1>
            <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">{t("userGuideSubtitle")}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GUIDE_STEPS.map(([titleKey, bodyKey], index) => (
          <article key={titleKey} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                {index + 1}
              </span>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{t(titleKey)}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{t(bodyKey)}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div>
        <section className="rounded-2xl border border-warning-200 bg-warning-50 p-5 dark:border-warning-500/20 dark:bg-warning-500/10">
          <h2 className="font-semibold text-warning-800 dark:text-warning-300">{t("guideImportantTitle")}</h2>
          <ul className="mt-3 space-y-2">
            {IMPORTANT_NOTES.map((key) => (
              <li key={key} className="flex gap-2 text-sm leading-6 text-warning-800/90 dark:text-warning-200/90">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-500" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
