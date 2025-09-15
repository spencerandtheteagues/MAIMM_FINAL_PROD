import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Check, Sparkles, Zap, Building2, CreditCard, Shield, ArrowLeft, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";
import { Logo } from "@/components/ui/logo";
// Removed embedded checkout - using Stripe-hosted checkout instead

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  credits: number;
  features: string[];
  popular?: boolean;
  icon: React.ComponentType<any>;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter Plan",
    description: "Perfect for small businesses or Influencers starting their social media journey",
    monthlyPrice: 19,
    yearlyPrice: 199,
    credits: 190,
    features: [
      "190 AI credits per month",
      "1 campaign: 14 image+text posts (2 per day/7 days)",
      "Connect up to 3 social media accounts",
      "AI content generation",
      "Content calendar",
      "Basic analytics",
      "Email support"
    ],
    icon: Zap
  },
  {
    id: "professional",
    name: "Professional Plan",
    description: "For growing businesses and Influencers with more advanced social media needs",
    monthlyPrice: 49,
    yearlyPrice: 499,
    credits: 500,
    features: [
      "500 AI credits per month",
      "Connect to all social media accounts",
      "Post to ALL accounts at once",
      "Unlimited AI text generation",
      "Advanced scheduling",
      "Team collaboration",
      "Priority support (24hr)",
      "Custom branding",
      "Content approval workflow"
    ],
    popular: true,
    icon: Sparkles
  },
  {
    id: "business",
    name: "Business Plan",
    description: "For businesses with advanced social media needs",
    monthlyPrice: 199,
    yearlyPrice: 1999,
    credits: 2000,
    features: [
      "2000 AI credits per month",
      "All social media accounts",
      "Unlimited AI text generation",
      "Higher usage limits for video and image",
      "API access",
      "Dedicated support",
      "Custom integrations",
      "Advanced analytics",
      "White-label options"
    ],
    icon: Building2
  }
];

export default function CheckoutPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [isDowngrade, setIsDowngrade] = useState(false);
  const [trial, setTrial] = useState(false);
  // Using Stripe-hosted checkout instead of embedded form

  const { data: user, isLoading: userLoading, error: userError } = useQuery<User>({
    queryKey: ["/api/user"],
    retry: false,
  });

  // Helper function to get tier priority for comparison
  const getTierPriority = (tier?: string) => {
    switch (tier) {
      case "business": return 4;
      case "professional": return 3;
      case "starter": return 2;
      case "free": return 1;
      default: return 0;
    }
  };

  // Parse query params whenever location changes
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const planId = params.get("plan") || "starter";
    const trialParam = params.get("trial") === "true";
    
    const plan = PRICING_PLANS.find(p => p.id === planId);
    
    if (plan) {
      setSelectedPlan(plan);
      setTrial(trialParam);
      
      // Check if this is a downgrade
      if (user) {
        const currentPriority = getTierPriority(user.tier);
        const selectedPriority = getTierPriority(plan.id);
        setIsDowngrade(selectedPriority < currentPriority);
      }
    } else {
      // Fallback to starter if plan not found
      const starterPlan = PRICING_PLANS.find(p => p.id === "starter");
      if (starterPlan) setSelectedPlan(starterPlan);
    }
  }, [location, user]);

  // Don't redirect immediately - allow viewing the checkout page

  const handleCheckout = async () => {
    if (!selectedPlan) return;
    
    // Check if user is authenticated before proceeding
    if (!user) {
      // Redirect to auth page with return URL
      const returnUrl = encodeURIComponent(location);
      setLocation(`/auth?return=${returnUrl}`);
      return;
    }
    
    // Prevent downgrade
    if (isDowngrade) {
      toast({
        title: "Downgrade Not Allowed",
        description: "Please contact support to downgrade your subscription.",
        variant: "destructive",
      });
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Create Stripe checkout session and redirect to Stripe-hosted page
      const response = await apiRequest(
        "POST",
        trial ? "/api/stripe/create-pro-trial" : "/api/billing/create-checkout-session",
        trial ? {} : { planId: selectedPlan.id }
      );
      
      const data = await response.json();
      
      if (data.url) {
        // Redirect to Stripe-hosted checkout page
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received from server");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast({
        title: "Checkout Error",
        description: error.message || "Unable to start checkout process. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  // Handle loading state for user data
  if (userLoading || !selectedPlan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-pink-950 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8">
            <p className="text-center text-muted-foreground">Loading checkout...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If user query failed (not authenticated), redirect to auth
  if (userError || !user) {
    const returnUrl = encodeURIComponent(location);
    setLocation(`/auth?return=${returnUrl}`);
    return null;
  }

  const Icon = selectedPlan.icon;
  const displayPrice = billingCycle === "monthly" ? selectedPlan.monthlyPrice : selectedPlan.yearlyPrice;
  const yearlyDiscount = Math.round((1 - (selectedPlan.yearlyPrice / 12) / selectedPlan.monthlyPrice) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-pink-950 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" animated />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Complete Your Order</h1>
          <p className="text-gray-300">
            {trial ? "Start your Pro trial for just $1" : "Choose your billing cycle and complete your subscription"}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Plan Details */}
          <Card className="bg-gray-900/80 border-gray-700">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Icon className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-white">{selectedPlan.name}</CardTitle>
                  {selectedPlan.popular && (
                    <Badge className="mt-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                      Most Popular
                    </Badge>
                  )}
                </div>
              </div>
              <CardDescription className="text-gray-400 mt-2">
                {selectedPlan.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="font-medium text-white mb-3">What's included:</div>
                {selectedPlan.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Checkout Form */}
          <Card className={`bg-gray-900/80 ${isDowngrade ? 'border-red-500/50' : 'border-gray-700'}`}>
            <CardHeader>
              <CardTitle className="text-white">Payment Details</CardTitle>
              <CardDescription className="text-gray-400">
                {isDowngrade ? "Downgrade not available" : trial ? "Card verification for Pro trial" : "Select your billing cycle"}
              </CardDescription>
              {isDowngrade && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-red-400 font-medium">Downgrade Not Available</p>
                    <p className="text-xs text-red-300 mt-1">
                      You're currently on the {user?.tier === 'professional' ? 'Professional' : 'Business'} plan. 
                      To downgrade, please contact our support team.
                    </p>
                  </div>
                </div>
              )}
              {user?.tier && !isDowngrade && selectedPlan && getTierPriority(selectedPlan.id) === getTierPriority(user.tier) && (
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-yellow-400 font-medium">You're already on this plan</p>
                    <p className="text-xs text-yellow-300 mt-1">
                      You're currently subscribed to the {selectedPlan.name}.
                    </p>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Billing Cycle Selection */}
              {!trial && (
                <div className="space-y-3">
                  <Label className="text-white">Billing Cycle</Label>
                  <RadioGroup value={billingCycle} onValueChange={(value) => setBillingCycle(value as "monthly" | "yearly")}>
                    <div className="flex items-center space-x-2 p-3 border border-gray-700 rounded-lg hover:bg-gray-800/50">
                      <RadioGroupItem value="monthly" id="monthly" />
                      <Label htmlFor="monthly" className="flex-1 cursor-pointer">
                        <div className="flex justify-between items-center">
                          <span className="text-white">Monthly</span>
                          <span className="text-white font-semibold">${selectedPlan.monthlyPrice}/mo</span>
                        </div>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-3 border border-purple-500 bg-purple-500/10 rounded-lg hover:bg-purple-500/20">
                      <RadioGroupItem value="yearly" id="yearly" />
                      <Label htmlFor="yearly" className="flex-1 cursor-pointer">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-white">Yearly</span>
                            {yearlyDiscount > 0 && (
                              <Badge className="ml-2 bg-green-500/20 text-green-400">
                                Save {yearlyDiscount}%
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-white font-semibold">${selectedPlan.yearlyPrice}/yr</span>
                            <div className="text-xs text-gray-400">${(selectedPlan.yearlyPrice / 12).toFixed(2)}/mo</div>
                          </div>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {/* Price Summary */}
              <div className="border-t border-gray-700 pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-gray-400">
                    <span>{selectedPlan.name}</span>
                    <span>
                      {trial ? "$1.00" : `$${displayPrice}.00`}
                    </span>
                  </div>
                  {trial && (
                    <div className="text-xs text-gray-500">
                      * $1 charge for card verification. Full subscription starts after trial.
                    </div>
                  )}
                  <div className="flex justify-between text-white font-semibold text-lg pt-2 border-t border-gray-700">
                    <span>Total {trial ? "(one-time)" : billingCycle === "yearly" ? "per year" : "per month"}</span>
                    <span>
                      {trial ? "$1.00" : `$${displayPrice}.00`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Checkout Button - Redirects to Stripe-hosted page */}
              <Button
                className={`w-full ${isDowngrade ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'} text-white`}
                size="lg"
                onClick={handleCheckout}
                disabled={isProcessing || isDowngrade || (user?.tier && getTierPriority(selectedPlan?.id) === getTierPriority(user.tier))}
                data-testid="button-proceed-checkout"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    {trial ? "Start $1 Trial" : `Continue to Payment`}
                  </>
                )}
              </Button>

              {/* Security Badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                <Shield className="w-4 h-4" />
                <span>Secure payment powered by Stripe</span>
              </div>

              {/* Back Link */}
              <Button
                variant="ghost"
                className="w-full text-gray-400 hover:text-white"
                onClick={() => setLocation("/pricing")}
                data-testid="button-back-pricing"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Pricing
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
