"use client";

import { useLanguage } from "@/context/LanguageContext";

const GUIDE_PHASES = [
  {
    titleKey: "guidePurchasePhaseTitle",
    descriptionKey: "guidePurchasePhaseDescription",
    resultKey: "guidePurchasePhaseResult",
    startNumber: 1,
    steps: [
      ["guidePreparePiTitle", "guidePreparePiBody"],
      ["guideCreateOrderTitle", "guideCreateOrderBody"],
      ["guideConfirmOrderTitle", "guideConfirmOrderBody"],
    ],
  },
  {
    titleKey: "guideImportPhaseTitle",
    descriptionKey: "guideImportPhaseDescription",
    resultKey: "guideImportPhaseResult",
    startNumber: 4,
    steps: [
      ["guideInvoicePackingTitle", "guideInvoicePackingBody"],
      ["guideBillTitle", "guideBillBody"],
      ["guideAllocateCargoTitle", "guideAllocateCargoBody"],
      ["guideOtherDocumentsTitle", "guideOtherDocumentsBody"],
      ["guideTrackTitle", "guideTrackBody"],
    ],
  },
  {
    titleKey: "guideWarehousePhaseTitle",
    descriptionKey: "guideWarehousePhaseDescription",
    resultKey: "guideWarehousePhaseResult",
    startNumber: 9,
    steps: [
      ["guideTransportTitle", "guideTransportBody"],
      ["guideFinishTitle", "guideFinishBody"],
    ],
  },
] as const;

const GUIDE_TERMS = [
  ["guideTermPi", "guideTermPiMeaning"],
  ["guideTermInv", "guideTermInvMeaning"],
  ["guideTermPkl", "guideTermPklMeaning"],
  ["guideTermBl", "guideTermBlMeaning"],
  ["guideTermOcr", "guideTermOcrMeaning"],
  ["guideTermItemCode", "guideTermItemCodeMeaning"],
  ["guideTermShippingDates", "guideTermShippingDatesMeaning"],
  ["guideTermCoHc", "guideTermCoHcMeaning"],
] as const;

export default function UserGuidePage() {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 pb-8">
      <header className="rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white p-5 dark:border-brand-500/20 dark:from-brand-500/10 dark:to-white/[0.02] sm:p-7">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("userGuideTitle")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">{t("userGuideSubtitle")}</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">{t("guideProcessLine")}</p>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("guideTermsTitle")}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("guideTermsDescription")}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {GUIDE_TERMS.map(([termKey, meaningKey]) => (
            <div key={termKey} className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
              <dt className="text-sm font-bold text-brand-600 dark:text-brand-300">{t(termKey)}</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{t(meaningKey)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {GUIDE_PHASES.map((phase, phaseIndex) => (
        <section key={phase.titleKey} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-start gap-4 border-b border-gray-100 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-gray-800/40 sm:p-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">
              {String(phaseIndex + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t(phase.titleKey)}</h2>
              <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{t(phase.descriptionKey)}</p>
            </div>
          </div>

          <ol className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
            {phase.steps.map(([titleKey, bodyKey], stepIndex) => (
                <li key={titleKey} className="flex gap-3 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                    {String(phase.startNumber + stepIndex).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t(titleKey)}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{t(bodyKey)}</p>
                  </div>
                </li>
              ))}
          </ol>
          <p className="mx-5 mb-5 rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-sm leading-6 text-success-800 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300 sm:mx-6 sm:mb-6">
            <span className="font-semibold">{t("guidePhaseResultLabel")}: </span>{t(phase.resultKey)}
          </p>
        </section>
      ))}

      <section className="rounded-2xl border border-warning-200 bg-warning-50 p-5 dark:border-warning-500/20 dark:bg-warning-500/10 sm:p-6">
        <h2 className="font-semibold text-warning-800 dark:text-warning-300">{t("guideImportantTitle")}</h2>
        <p className="mt-2 text-sm leading-6 text-warning-800/90 dark:text-warning-200/90">{t("guideImportantBody")}</p>
      </section>
    </div>
  );
}
