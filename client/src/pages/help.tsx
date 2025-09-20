import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MessageSquare, Clock, Send, HelpCircle, BookOpen, Mail, FileText, Scroll } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import { Link } from "wouter";

const faqs = [
  {
    question: "How do I connect my social media accounts?",
    answer: "Go to the Platforms page and click 'Connect Account' for each platform. You can use OAuth for X.com or enter API keys for other platforms. Follow the instructions provided for each platform to get your API credentials."
  },
  {
    question: "What are AI credits and how do they work?",
    answer: "AI credits are used for generating content, images, and videos using AI. Each generation costs a certain number of credits. Free trial users get 50 credits, and paid plans include monthly credit allowances."
  },
  {
    question: "How does the referral program work?",
    answer: "Share your referral code with friends. You earn 25-50 credits for free trial referrals (first 5), and 100 credits for each paid subscription referral. After 25 paid referrals, you get a free month subscription!"
  },
  {
    question: "Can I schedule posts in advance?",
    answer: "Yes! Use the Calendar feature to schedule posts for any date and time. The system will automatically publish them at the scheduled time across your connected platforms."
  },
  {
    question: "How do I upgrade my subscription?",
    answer: "Go to the Billing page to view available plans and upgrade. You can choose from Starter ($15/mo), Professional ($49/mo), or Business ($199/mo) plans."
  },
  {
    question: "What's the difference between subscription tiers?",
    answer: "Each tier offers different features: Starter includes 3 accounts and 50 posts/month, Professional includes 10 accounts and unlimited posts, Business includes unlimited accounts and premium features."
  },
  {
    question: "How long does support take to respond?",
    answer: "We aim to respond to all support inquiries within 48 hours. Priority support (24hr) is available for Professional plans, and 4hr response for Business plans."
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer: "Yes, you can cancel your subscription at any time from the Billing page. You'll retain access until the end of your current billing period."
  }
];

export default function Help() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supportForm, setSupportForm] = useState({
    subject: "",
    category: "",
    message: "",
    priority: "normal"
  });
  
  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });
  
  const handleSubmitTicket = async () => {
    if (!supportForm.subject || !supportForm.category || !supportForm.message) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await apiRequest("POST", "/api/support/ticket", {
        ...supportForm,
        userEmail: user?.email,
        userName: user?.fullName,
        tier: user?.tier
      });
      
      toast({
        title: "Ticket Submitted",
        description: "We'll respond within 48 hours to your email",
      });
      
      setSupportForm({
        subject: "",
        category: "",
        message: "",
        priority: "normal"
      });
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Unable to submit support ticket. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <HelpCircle className="w-8 h-8 text-primary" />
          Help & Support
        </h1>
        <p className="text-muted-foreground mt-2">
          Get help with MyAiMediaMgr - We're here to assist you
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Contact Support
              </CardTitle>
              <CardDescription>
                Send us a message and we'll respond within 48 hours
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Response time: 48 hours via email (no phone or live chat available)
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    value={supportForm.subject}
                    onChange={(e) => setSupportForm({...supportForm, subject: e.target.value})}
                    placeholder="Brief description of your issue"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={supportForm.category}
                    onValueChange={(value) => setSupportForm({...supportForm, category: value})}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="account">Account & Billing</SelectItem>
                      <SelectItem value="platform">Platform Connections</SelectItem>
                      <SelectItem value="technical">Technical Issue</SelectItem>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="content">Content & AI</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={supportForm.priority}
                    onValueChange={(value) => setSupportForm({...supportForm, priority: value})}
                  >
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low - General question</SelectItem>
                      <SelectItem value="normal">Normal - Standard issue</SelectItem>
                      <SelectItem value="high">High - Blocking my work</SelectItem>
                      <SelectItem value="urgent">Urgent - Critical business impact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    value={supportForm.message}
                    onChange={(e) => setSupportForm({...supportForm, message: e.target.value})}
                    placeholder="Please describe your issue in detail..."
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    Include any relevant details, error messages, or steps to reproduce the issue
                  </p>
                </div>
                
                <Button 
                  onClick={handleSubmitTicket}
                  disabled={isSubmitting}
                  className="w-full"
                  data-testid="button-submit-ticket"
                >
                  {isSubmitting ? (
                    "Submitting..."
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Support Ticket
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Support Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium text-sm">Email Support Only</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    We respond to all inquiries via email within 48 hours
                  </p>
                </div>
                
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium text-sm">No Phone Support</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    We do not offer phone support at this time
                  </p>
                </div>
                
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium text-sm">No Live Chat</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Live chat is not available, please submit a ticket
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/10 to-accent/10">
            <CardHeader>
              <CardTitle>Your Support Tier</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Current Plan</span>
                  <span className="font-bold capitalize">{user?.tier || "Free"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Response Time</span>
                  <span className="font-bold">
                    {user?.tier === "enterprise" ? "4 hours" : 
                     user?.tier === "professional" ? "24 hours" : "48 hours"}
                  </span>
                </div>
                {user?.tier === "free" && (
                  <div className="mt-4 p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      Upgrade to Professional for 24hr support or Business for 4hr priority support
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={() => window.location.href = "/billing"}
                    >
                      Upgrade Now
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                <BookOpen className="w-4 h-4 mr-2" />
                Documentation
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <MessageSquare className="w-4 h-4 mr-2" />
                Community Forum
              </Button>
              <Button variant="outline" className="w-full justify-start">
                Video Tutorials
              </Button>
              <Link href="/terms-of-service">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  data-testid="link-terms-of-service"
                >
                  <Scroll className="w-4 h-4 mr-2" />
                  Terms of Service
                </Button>
              </Link>
              <Link href="/privacy-policy">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  data-testid="link-privacy-policy"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Privacy Policy
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
