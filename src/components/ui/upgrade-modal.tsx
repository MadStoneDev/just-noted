"use client";

import React from "react";
import {
  IconX,
  IconCheck,
  IconCrown,
  IconSparkles,
  IconUsers,
  IconCloudUpload,
  IconHistory,
  IconTemplate,
} from "@tabler/icons-react";
import { SubscriptionTier, SUBSCRIPTION_LIMITS } from "@/types/subscription";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier: SubscriptionTier;
  onSelectPlan?: (tier: "pro" | "team") => void;
  highlightFeature?: string;
}

const PRICING = {
  pro: {
    monthly: 9,
    yearly: 90, // 2 months free
  },
  team: {
    monthly: 19,
    yearly: 190, // 2 months free
  },
};

export default function UpgradeModal({
  isOpen,
  onClose,
  currentTier,
  onSelectPlan,
  highlightFeature,
}: UpgradeModalProps) {
  if (!isOpen) return null;

  const plans = [
    {
      id: "free" as const,
      name: "Free",
      description: "For personal note-taking",
      price: 0,
      features: [
        { text: "Up to 50 notes", included: true },
        { text: "Basic editor features", included: true },
        { text: "Export notes", included: true },
        { text: "10 version history", included: true },
        { text: "AI Analysis (limited)", included: false, highlight: highlightFeature === "ai" },
        { text: "Collaboration", included: false, highlight: highlightFeature === "collaboration" },
      ],
    },
    {
      id: "pro" as const,
      name: "Pro",
      description: "For power users",
      price: PRICING.pro.monthly,
      yearlyPrice: PRICING.pro.yearly,
      popular: true,
      features: [
        { text: "Unlimited notes", included: true },
        { text: "All editor features", included: true },
        { text: "Export all formats", included: true },
        { text: "100 version history", included: true },
        { text: "Unlimited AI Analysis", included: true, highlight: highlightFeature === "ai" },
        { text: "Collaborate with 5 people", included: true, highlight: highlightFeature === "collaboration" },
      ],
    },
    {
      id: "team" as const,
      name: "Team",
      description: "For teams and organizations",
      price: PRICING.team.monthly,
      yearlyPrice: PRICING.team.yearly,
      features: [
        { text: "Everything in Pro", included: true },
        { text: "Unlimited collaborators", included: true },
        { text: "Unlimited version history", included: true },
        { text: "Priority support", included: true },
        { text: "Team admin dashboard", included: true },
        { text: "SSO (coming soon)", included: true },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 p-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 id="upgrade-modal-title" className="text-xl font-bold">
              Choose Your Plan
            </h2>
            <p className="text-sm text-neutral-500">
              Unlock powerful features to boost your productivity
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Plans */}
        <div className="p-6">
          <div className="grid md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-xl border-2 p-6 transition-all ${
                  plan.popular
                    ? "border-mercedes-primary shadow-lg scale-105"
                    : "border-neutral-200 hover:border-neutral-300"
                } ${currentTier === plan.id ? "bg-neutral-50" : "bg-white"}`}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-mercedes-primary text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}

                {/* Plan header */}
                <div className="text-center mb-6">
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <p className="text-sm text-neutral-500">{plan.description}</p>

                  <div className="mt-4">
                    {plan.price === 0 ? (
                      <div className="text-3xl font-bold">Free</div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold">
                          ${plan.price}
                          <span className="text-base font-normal text-neutral-500">/mo</span>
                        </div>
                        {plan.yearlyPrice && (
                          <div className="text-sm text-neutral-500">
                            or ${plan.yearlyPrice}/year (save 2 months)
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => {
                    const isHighlighted = "highlight" in feature && feature.highlight;
                    return (
                      <li
                        key={index}
                        className={`flex items-start gap-2 text-sm ${
                          isHighlighted
                            ? "bg-amber-50 -mx-2 px-2 py-1 rounded-lg border border-amber-200"
                            : ""
                        }`}
                      >
                        {feature.included ? (
                          <IconCheck
                            size={16}
                            className={`flex-shrink-0 mt-0.5 ${
                              isHighlighted ? "text-amber-600" : "text-green-500"
                            }`}
                          />
                        ) : (
                          <IconX
                            size={16}
                            className="flex-shrink-0 mt-0.5 text-neutral-300"
                          />
                        )}
                        <span
                          className={
                            feature.included ? "text-neutral-700" : "text-neutral-400"
                          }
                        >
                          {feature.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* CTA Button */}
                {currentTier === plan.id ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-lg bg-neutral-100 text-neutral-500 font-medium cursor-not-allowed"
                  >
                    Current Plan
                  </button>
                ) : plan.id === "free" ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-lg bg-neutral-100 text-neutral-500 font-medium cursor-not-allowed"
                  >
                    Free Forever
                  </button>
                ) : (
                  <button
                    onClick={() => onSelectPlan?.(plan.id)}
                    className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
                      plan.popular
                        ? "bg-mercedes-primary text-white hover:bg-mercedes-primary/90"
                        : "bg-neutral-900 text-white hover:bg-neutral-800"
                    }`}
                  >
                    Upgrade to {plan.name}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Feature highlights */}
          <div className="mt-8 grid md:grid-cols-4 gap-4">
            {[
              {
                icon: IconSparkles,
                title: "AI Analysis",
                desc: "Smart pattern detection",
              },
              {
                icon: IconUsers,
                title: "Collaboration",
                desc: "Work together in real-time",
              },
              {
                icon: IconHistory,
                title: "Version History",
                desc: "Never lose your work",
              },
              {
                icon: IconCloudUpload,
                title: "Cloud Sync",
                desc: "Access from anywhere",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg"
              >
                <feature.icon size={24} className="text-mercedes-primary" />
                <div>
                  <div className="font-medium text-sm">{feature.title}</div>
                  <div className="text-xs text-neutral-500">{feature.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* FAQ/Trust badges */}
          <div className="mt-8 text-center text-sm text-neutral-500">
            <p>Cancel anytime. 14-day money-back guarantee.</p>
            <p className="mt-1">
              Questions? <a href="/contact" className="text-mercedes-primary hover:underline">Contact us</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple upgrade banner for inline use
export function UpgradeBanner({
  feature,
  onUpgrade,
}: {
  feature: string;
  onUpgrade: () => void;
}) {
  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <IconCrown size={24} className="text-purple-500" />
        <div>
          <p className="font-medium text-purple-900">Upgrade to unlock {feature}</p>
          <p className="text-sm text-purple-700">Get unlimited access with Pro</p>
        </div>
      </div>
      <button
        onClick={onUpgrade}
        className="px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors"
      >
        Upgrade
      </button>
    </div>
  );
}
