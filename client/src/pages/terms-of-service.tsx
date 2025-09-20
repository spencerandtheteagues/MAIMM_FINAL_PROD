import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileText, ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";

export default function TermsOfService() {
  useEffect(() => {
    document.title = "Terms of Service - MyAiMediaMgr";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Terms of Service for MyAiMediaMgr AI-powered social media management platform. Learn about our service terms, user rights, and legal obligations.');
    }
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link href="/settings">
          <Button variant="ghost" className="mb-4" data-testid="button-back-to-settings">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Settings
          </Button>
        </Link>
        
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
            <p className="text-muted-foreground">Last updated: September 14, 2025</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Terms of Service Agreement</CardTitle>
          <CardDescription>
            Please read these Terms of Service carefully before using MyAiMediaMgr
          </CardDescription>
        </CardHeader>
        
        <CardContent className="prose prose-sm max-w-none dark:prose-invert space-y-8">
          {/* 1. Introduction */}
          <section>
            <h2 className="text-xl font-semibold mb-4">1. Introduction and Acceptance</h2>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to MyAiMediaMgr ("we," "our," or "us"). These Terms of Service ("Terms") govern your use of our AI-powered social media management platform ("Service"). By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of these terms, you may not access the Service.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Our Service provides automated social media content creation, scheduling, and management tools powered by artificial intelligence. We offer various subscription plans and a credit-based system for AI-generated content.
            </p>
          </section>

          <Separator />

          {/* 2. Service Description */}
          <section>
            <h2 className="text-xl font-semibold mb-4">2. Service Description</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              MyAiMediaMgr provides:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>AI-powered content generation for social media posts, images, and videos</li>
              <li>Content scheduling and automated publishing across multiple platforms</li>
              <li>Social media analytics and performance tracking</li>
              <li>Campaign management and content approval workflows</li>
              <li>Content library and asset management</li>
              <li>Team collaboration tools and user management</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Our Service integrates with various social media platforms including but not limited to Facebook, Instagram, X (Twitter), LinkedIn, and TikTok.
            </p>
          </section>

          <Separator />

          {/* 3. User Accounts */}
          <section>
            <h2 className="text-xl font-semibold mb-4">3. User Accounts and Registration</h2>
            <p className="text-muted-foreground leading-relaxed">
              To use our Service, you must create an account by providing accurate, current, and complete information. You are responsible for safeguarding your account credentials and for all activities that occur under your account.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You must be at least 18 years old to use our Service. If you are using our Service on behalf of a business or organization, you represent that you have the authority to bind that entity to these Terms.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You agree to notify us immediately of any unauthorized access to or use of your account. We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <Separator />

          {/* 4. Subscription and Billing */}
          <section>
            <h2 className="text-xl font-semibold mb-4">4. Subscription Plans and Billing</h2>
            <h3 className="text-lg font-medium mb-2">Subscription Tiers</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We offer various subscription plans with different features and credit allowances:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground mb-4">
              <li>Free Trial: Limited-time access with basic features</li>
              <li>Starter Plan: Monthly subscription for small businesses</li>
              <li>Professional Plan: Enhanced features for growing businesses</li>
              <li>Business Plan: Advanced features for businesses</li>
            </ul>
            
            <h3 className="text-lg font-medium mb-2">Credit System</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our Service uses a credit-based system for AI content generation. Credits are consumed when generating text, images, or videos. Monthly credits reset at the beginning of each billing cycle and unused credits do not roll over unless specified in your plan.
            </p>
            
            <h3 className="text-lg font-medium mb-2">Billing and Payments</h3>
            <p className="text-muted-foreground leading-relaxed">
              Subscription fees are billed in advance on a monthly or annual basis. All fees are non-refundable except as required by law. We use Stripe for secure payment processing. By providing payment information, you authorize us to charge the applicable fees to your payment method.
            </p>
            
            <h3 className="text-lg font-medium mb-2">Price Changes</h3>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify our pricing with 30 days' notice. Price changes will not affect your current billing cycle but will apply to subsequent renewals.
            </p>
          </section>

          <Separator />

          {/* 5. Data Protection and Privacy */}
          <section>
            <h2 className="text-xl font-semibold mb-4">5. Data Protection and Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your privacy is important to us. Our collection, use, and sharing of your personal information is governed by our Privacy Policy, which is incorporated into these Terms by reference. By using our Service, you consent to the practices described in our Privacy Policy.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You retain ownership of all content you create or upload to our Service. However, you grant us a limited license to use, store, and process your content to provide our Service, including for AI training and improvement purposes as detailed in our Privacy Policy.
            </p>
          </section>

          <Separator />

          {/* 6. Intellectual Property */}
          <section>
            <h2 className="text-xl font-semibold mb-4">6. Intellectual Property Rights</h2>
            <h3 className="text-lg font-medium mb-2">Our Intellectual Property</h3>
            <p className="text-muted-foreground leading-relaxed">
              The Service, including its software, algorithms, user interface, and documentation, is owned by MyAiMediaMgr and protected by intellectual property laws. You may not copy, modify, distribute, or reverse engineer our Service.
            </p>
            
            <h3 className="text-lg font-medium mb-2">AI-Generated Content</h3>
            <p className="text-muted-foreground leading-relaxed">
              Content generated by our AI systems is provided to you for your use. However, you acknowledge that AI-generated content may not be unique and similar content could be generated for other users. You are responsible for ensuring that any content you publish complies with applicable laws and platform terms of service.
            </p>
            
            <h3 className="text-lg font-medium mb-2">User Content</h3>
            <p className="text-muted-foreground leading-relaxed">
              You retain ownership of content you create or upload. By using our Service, you grant us a worldwide, non-exclusive license to use your content solely for providing and improving our Service.
            </p>
          </section>

          <Separator />

          {/* 7. Acceptable Use */}
          <section>
            <h2 className="text-xl font-semibold mb-4">7. Acceptable Use Policy</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              You agree not to use our Service to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Generate or distribute illegal, harmful, threatening, abusive, or defamatory content</li>
              <li>Create content that infringes on intellectual property rights of others</li>
              <li>Generate spam, misleading information, or deceptive content</li>
              <li>Attempt to reverse engineer, hack, or compromise our Service</li>
              <li>Use our Service to violate any social media platform's terms of service</li>
              <li>Generate content that promotes violence, discrimination, or illegal activities</li>
              <li>Use automated tools to abuse our credit system or create fake accounts</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We reserve the right to monitor content and suspend or terminate accounts that violate this policy.
            </p>
          </section>

          <Separator />

          {/* 8. AI Services and Limitations */}
          <section>
            <h2 className="text-xl font-semibold mb-4">8. AI Services and Limitations</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our AI-powered features are provided "as is" and may not always produce perfect results. AI-generated content should be reviewed before publication. We do not guarantee the accuracy, completeness, or suitability of AI-generated content for your specific purposes.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You acknowledge that AI technology has limitations and may occasionally produce unexpected or inappropriate results. You are solely responsible for reviewing and approving all content before publication.
            </p>
          </section>

          <Separator />

          {/* 9. Third-Party Integrations */}
          <section>
            <h2 className="text-xl font-semibold mb-4">9. Third-Party Platform Integrations</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our Service integrates with various social media platforms and third-party services. These integrations are subject to the terms and policies of those platforms. We are not responsible for changes to third-party APIs or services that may affect our Service.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You are responsible for ensuring your use of our Service complies with the terms of service of all connected platforms. We may suspend features or terminate integrations if required by third-party platforms.
            </p>
          </section>

          <Separator />

          {/* 10. Disclaimers and Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold mb-4">10. Disclaimers and Limitation of Liability</h2>
            <h3 className="text-lg font-medium mb-2">Service Availability</h3>
            <p className="text-muted-foreground leading-relaxed">
              We strive to maintain high service availability but do not guarantee uninterrupted access. Our Service may be temporarily unavailable due to maintenance, updates, or technical issues.
            </p>
            
            <h3 className="text-lg font-medium mb-2">Limitation of Liability</h3>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, MyAiMediaMgr shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities.
            </p>
            
            <h3 className="text-lg font-medium mb-2">Indemnification</h3>
            <p className="text-muted-foreground leading-relaxed">
              You agree to indemnify and hold harmless MyAiMediaMgr from any claims, damages, or expenses arising from your use of our Service or violation of these Terms.
            </p>
          </section>

          <Separator />

          {/* 11. Termination */}
          <section>
            <h2 className="text-xl font-semibold mb-4">11. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              You may terminate your account at any time through your account settings. Upon termination, your access to the Service will cease, and your data may be deleted in accordance with our data retention policies.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We may suspend or terminate your account if you violate these Terms, engage in fraudulent activity, or for any other reason at our sole discretion. We will provide reasonable notice when possible.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Upon termination, you may request a copy of your data for up to 30 days, after which it may be permanently deleted.
            </p>
          </section>

          <Separator />

          {/* 12. Changes to Terms */}
          <section>
            <h2 className="text-xl font-semibold mb-4">12. Changes to These Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify users of significant changes via email or through our Service. Continued use of our Service after changes constitute acceptance of the new Terms.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              If you do not agree to the modified Terms, you must stop using our Service and may terminate your account.
            </p>
          </section>

          <Separator />

          {/* 13. Governing Law */}
          <section>
            <h2 className="text-xl font-semibold mb-4">13. Governing Law and Dispute Resolution</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms are governed by the laws of [State/Country]. Any disputes arising from these Terms or your use of our Service shall be resolved through binding arbitration in accordance with the rules of [Arbitration Organization].
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You waive any right to participate in class action lawsuits or class-wide arbitration against MyAiMediaMgr.
            </p>
          </section>

          <Separator />

          {/* 14. Contact Information */}
          <section>
            <h2 className="text-xl font-semibold mb-4">14. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about these Terms, please contact us at:
            </p>
            <div className="bg-muted p-4 rounded-lg mt-3">
              <p className="font-medium">MyAiMediaMgr</p>
              <p className="text-muted-foreground">Email: legal@myaimediamgr.com</p>
              <p className="text-muted-foreground">Address: [Company Address]</p>
              <p className="text-muted-foreground">Website: www.myaimediamgr.com</p>
            </div>
          </section>

          <Separator />

          {/* Footer */}
          <section className="text-center">
            <p className="text-sm text-muted-foreground">
              By using MyAiMediaMgr, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
            <div className="flex justify-center gap-4 mt-4">
              <Link href="/privacy-policy">
                <Button variant="outline" size="sm" data-testid="link-privacy-policy">
                  Privacy Policy
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </Link>
              <Link href="/help">
                <Button variant="outline" size="sm" data-testid="link-help">
                  Contact Support
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
