import React from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const SUBSCRIPTION_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$19",
    period: "/month",
    description: "Perfect for small businesses starting their social media journey",
    credits: "190 credits per month",
    features: [
      "190 credits per month",
      "1 campaign: 14 image+text posts (2 per day/7 days)",
      "3 social media accounts",
      "AI content generation",
      "Analytics dashboard",
      "Email support"
    ],
    popular: false
  },
  {
    id: "professional", 
    name: "Professional",
    price: "$49",
    period: "/month",
    description: "For growing businesses with advanced social media needs",
    credits: "500 credits per month",
    features: [
      "500 credits per month",
      "10 social media accounts",
      "Unlimited posts", 
      "Advanced AI content generation",
      "Full analytics suite",
      "Priority email support (24hr)",
      "Team collaboration (3 users)",
      "Content approval workflow",
      "Custom branding"
    ],
    popular: true
  },
  {
    id: "business",
    name: "Business", 
    price: "$199",
    period: "/month",
    description: "For businesses with advanced social media needs",
    credits: "2000 credits per month",
    features: [
      "2000 credits per month",
      "Unlimited social media accounts",
      "Unlimited posts",
      "Advanced AI with custom models",
      "White-label options", 
      "Dedicated account manager",
      "Unlimited team members",
      "API access",
      "Custom integrations",
      "SLA guarantee"
    ],
    popular: false
  }
];

export default function PricingPage() {
  const [, setLocation] = useLocation();

  const handleSelectPlan = async (planId: string) => {
    try {
      const res = await apiRequest("POST", "/api/stripe/create-checkout-session", { planId });
      if ((res as any)?.url) {
        window.location.href = (res as any).url;
      } else {
        setLocation("/billing");
      }
    } catch (err: any) {
      if (err?.status === 401) {
        setLocation(`/auth?return=${encodeURIComponent("/pricing")}`);
        return;
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-pink-950 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Scale your social media presence with AI-powered content creation and management
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative p-8 rounded-2xl ${
                plan.popular
                  ? "bg-gradient-to-br from-purple-900/80 to-pink-900/80 border-2 border-purple-500"
                  : "bg-gray-900/80 border border-gray-700"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <div className="mb-2">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-gray-400">{plan.period}</span>
                </div>
                <p className="text-sm text-gray-400 mb-2">{plan.credits}</p>
                <p className="text-gray-300">{plan.description}</p>
              </div>

              <div className="space-y-3 mb-8">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-300 text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => handleSelectPlan(plan.id)}
                className={`w-full py-3 rounded-xl font-semibold ${
                  plan.popular
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                    : "bg-gray-800 hover:bg-gray-700 text-white border border-gray-600"
                }`}
                data-testid={`button-select-${plan.id}`}
              >
                Get Started
              </Button>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-gray-400 mb-4">
            Want to try before you buy?
          </p>
          <Button
            onClick={() => setLocation('/trial-selection')}
            variant="outline"
            className="bg-transparent border-gray-600 text-gray-300 hover:bg-gray-800"
            data-testid="button-start-trial"
          >
            View All Plans &amp; Trials
          </Button>
        </div>
      </div>
    </div>
  );
}
