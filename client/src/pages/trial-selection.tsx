import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, CreditCard, Sparkles, Zap, Building, Users, TrendingUp, BarChart, Crown, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TrialSelection() {
  const [, setLocation] = useLocation();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const { toast } = useToast();

  // Check if user has already selected a trial (optional - may be unauthenticated)
  const { data: user, isLoading, error } = useCurrentUser();

  // If user is authenticated and has already selected a trial, redirect to app
  if (user && !(user as any).needsTrialSelection && !isLoading) {
    setLocation("/");
    return null;
  }

  // Always show content - don't block unauthenticated users
  const shouldShowContent = true;

  const selectTrialMutation = useMutation({
    mutationFn: async (planId: string) => {
      return apiRequest("POST", "/api/trial/select", { planId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Welcome to MyAiMediaMgr!",
        description: "Your trial has been activated successfully.",
      });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to activate trial. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSelection = async (optionId: string, isSubscription: boolean = false, isPaidTrial: boolean = false) => {
    setSelectedOption(optionId);

    if (!user && !error) {
      const returnUrl = encodeURIComponent(`/trial-selection`);
      setLocation(`/auth?return=${returnUrl}`);
      return;
    }

    if (isSubscription || isPaidTrial) {
      const planParam = isPaidTrial ? `${optionId}&trial=true` : optionId;
      setLocation(`/checkout?plan=${planParam}`);
      return;
    }

    if (optionId === "nocard7") {
      try {
        await apiRequest("POST", "/api/trial/select", { planId: "lite" });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        toast({
          title: "Welcome to MyAiMediaMgr!",
          description: "Your Lite trial has been activated.",
        });
        setLocation("/");
      } catch (e: any) {
        if (e?.status === 401) {
          const returnUrl = encodeURIComponent(`/trial-selection`);
          setLocation(`/auth?return=${returnUrl}`);
          return;
        }
        toast({
          title: "Error",
          description: e?.message || "Failed to activate Lite trial. Please try again.",
          variant: "destructive",
        });
      }
      return;
    }

    if (!user) {
      const returnUrl = encodeURIComponent(`/trial-selection`);
      setLocation(`/auth?return=${returnUrl}`);
      return;
    }
    selectTrialMutation.mutate(optionId);
  };

  const isMutating = selectTrialMutation.isPending;

  // Show loading only for authenticated users checking trial status
  if (!shouldShowContent && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-pink-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-400 mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-pink-950 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-300 mb-2">
            Scale your social media presence with AI-powered content creation and management
          </p>
          <p className="text-sm text-gray-400">
            {user ?
              "Select any option below to get started - all new users must choose a plan to continue" :
              "View our plans and pricing options. Sign up to get started with your chosen plan."
            }
          </p>
        </div>

        {/* All 5 Plan Options */}
        <div className="grid md:grid-cols-5 gap-6 max-w-7xl mx-auto">

          {/* Lite Trial - FREE */}
          <Card className="relative overflow-hidden border-2 border-green-500/30 bg-gradient-to-br from-slate-900 to-green-900/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Sparkles className="h-8 w-8 text-green-400" />
                <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full">
                  FREE
                </span>
              </div>
              <CardTitle className="text-xl text-white">Lite Trial</CardTitle>
              <CardDescription className="text-gray-300">
                No card required — 7 days
              </CardDescription>
              <div className="mt-2">
                <span className="text-3xl font-bold text-white">$0</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>30 AI Credits</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>1 Social Platform</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>6 AI Images total</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Basic content creation</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Best for trying content creation without a card
              </p>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                onClick={() => handleSelection("nocard7")}
                disabled={isMutating || selectedOption === "nocard7"}
              >
                {selectedOption === "nocard7" && isMutating ? "Activating..." : "Start Lite Trial"}
              </Button>
            </CardFooter>
          </Card>

          {/* Pro Trial - $1 */}
          <Card className="relative overflow-hidden border-2 border-purple-500/30 bg-gradient-to-br from-slate-900 to-purple-900/20">
            <div className="absolute top-0 right-0 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-2 py-1 rounded-bl-lg">
              RECOMMENDED
            </div>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Zap className="h-8 w-8 text-purple-400" />
                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full">
                  14 DAYS
                </span>
              </div>
              <CardTitle className="text-xl text-white">Pro Trial</CardTitle>
              <CardDescription className="text-gray-300">
                Card verification — 14 days
              </CardDescription>
              <div className="mt-2">
                <span className="text-3xl font-bold text-white">$1</span>
                <span className="text-gray-400 text-sm"> one-time</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>150 AI Credits</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>All Social Platforms</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Full Campaigns</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>AI Images &amp; Videos</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Everything in Pro</span>
                </div>
              </div>
              <p className="text-xs text-green-400 font-medium mt-3">
                Best for testing full workflow including video
              </p>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                onClick={() => handleSelection("professional", false, true)}
                disabled={isMutating || selectedOption === "professional"}
              >
                {selectedOption === "professional" && isMutating ? "Processing..." : "Start Pro Trial ($1)"}
              </Button>
            </CardFooter>
          </Card>

          {/* Starter Plan - $19/month */}
          <Card className="relative overflow-hidden border-2 border-blue-500/30 bg-gradient-to-br from-slate-900 to-blue-900/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <TrendingUp className="h-8 w-8 text-blue-400" />
                <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full">
                  MONTHLY
                </span>
              </div>
              <CardTitle className="text-xl text-white">Starter</CardTitle>
              <CardDescription className="text-gray-300">
                Perfect for small businesses
              </CardDescription>
              <div className="mt-2">
                <span className="text-3xl font-bold text-white">$19</span>
                <span className="text-gray-400 text-sm">/month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>190 credits per month</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>3 social media accounts</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>1 campaign per month</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>AI content generation</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Analytics dashboard</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                onClick={() => handleSelection("starter", true)}
                disabled={isMutating || selectedOption === "starter"}
              >
                {selectedOption === "starter" && isMutating ? "Processing..." : "Get Started"}
              </Button>
            </CardFooter>
          </Card>

          {/* Professional Plan - $49/month */}
          <Card className="relative overflow-hidden border-2 border-pink-500/30 bg-gradient-to-br from-slate-900 to-pink-900/20">
            <div className="absolute top-0 right-0 bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs font-bold px-2 py-1 rounded-bl-lg">
              MOST POPULAR
            </div>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Star className="h-8 w-8 text-pink-400" />
                <span className="text-xs bg-pink-500/20 text-pink-300 px-2 py-1 rounded-full">
                  MONTHLY
                </span>
              </div>
              <CardTitle className="text-xl text-white">Professional</CardTitle>
              <CardDescription className="text-gray-300">
                For growing businesses
              </CardDescription>
              <div className="mt-2">
                <span className="text-3xl font-bold text-white">$49</span>
                <span className="text-gray-400 text-sm">/month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>500 credits per month</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>10 social media accounts</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Unlimited posts</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Advanced AI generation</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Full analytics suite</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                onClick={() => handleSelection("professional", true)}
                disabled={isMutating || selectedOption === "professional"}
              >
                {selectedOption === "professional" && isMutating ? "Processing..." : "Get Started"}
              </Button>
            </CardFooter>
          </Card>

          {/* Business Plan - $199/month */}
          <Card className="relative overflow-hidden border-2 border-yellow-500/30 bg-gradient-to-br from-slate-900 to-yellow-900/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Crown className="h-8 w-8 text-yellow-400" />
                <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded-full">
                  BUSINESS
                </span>
              </div>
              <CardTitle className="text-xl text-white">Business</CardTitle>
              <CardDescription className="text-gray-300">
                For advanced teams
              </CardDescription>
              <div className="mt-2">
                <span className="text-3xl font-bold text-white">$199</span>
                <span className="text-gray-400 text-sm">/month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>2000 credits per month</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Unlimited accounts</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Advanced AI with custom models</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>White-label options</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Check className="h-3 w-3 text-green-400" />
                  <span>Dedicated account manager</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                onClick={() => handleSelection("business", true)}
                disabled={isMutating || selectedOption === "business"}
              >
                {selectedOption === "business" && isMutating ? "Processing..." : "Get Started"}
              </Button>
            </CardFooter>
          </Card>

        </div>

        <div className="text-center mt-12 text-gray-400">
          <p className="text-sm">
            All plans include AI-powered content generation, scheduling, and analytics.
          </p>
          <p className="text-sm mt-2">
            Only Lite Trial is free. All other options require payment. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
