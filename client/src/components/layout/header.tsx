import { useLocation, Link } from "wouter";
import { 
  Plus, 
  ChevronDown, 
  FileText, 
  Image, 
  Video, 
  CalendarDays, 
  Sparkles, 
  Palette, 
  User, 
  CreditCard, 
  Gift, 
  HelpCircle, 
  LogOut, 
  Crown, 
  Star,
  Zap,
  AlertTriangle,
  Coins,
  ArrowUp,
  Menu
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import type { User as UserType } from "@shared/schema";

const pageData = {
  "/": {
    title: "Dashboard",
    subtitle: "Your social media command center"
  },
  "/create": {
    title: "Create Content",
    subtitle: "Create engaging posts with AI assistance"
  },
  "/calendar": {
    title: "Content Calendar",
    subtitle: "View and manage your scheduled posts"
  },
  "/approval": {
    title: "Approval Queue",
    subtitle: "Review and approve content before publishing"
  },
  "/analytics": {
    title: "Analytics",
    subtitle: "Track your social media performance across all platforms"
  },
  "/library": {
    title: "Content Library",
    subtitle: "Manage all your content drafts and published posts"
  },
  "/settings": {
    title: "Settings",
    subtitle: "Configure your account and platform settings"
  }
};

// Credit costs for operations
const CREDIT_COSTS = {
  text: 1,
  image: 5,
  video: 20,
  campaign: 14
};

// Credit balance component with warnings
function CreditBalance({ user, onBuyCredits }: { user: UserType | undefined; onBuyCredits: () => void }) {
  const credits = user?.credits || 0;
  const isAdmin = user?.role === "admin";
  const isLow = credits < 10 && !isAdmin;
  const isCritical = credits < 3 && !isAdmin;

  const getStatusColor = () => {
    if (isAdmin) return "bg-purple-500 text-white";
    if (isCritical) return "bg-red-500 text-white";
    if (isLow) return "bg-amber-500 text-white";
    return "bg-green-500 text-white";
  };

  const getStatusIcon = () => {
    if (isAdmin) return <Crown className="w-4 h-4" />;
    if (isCritical) return <AlertTriangle className="w-4 h-4" />;
    if (isLow) return <Zap className="w-4 h-4" />;
    return <Coins className="w-4 h-4" />;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          className={`px-3 py-2 h-auto ${getStatusColor()} hover:opacity-90 transition-all`}
          onClick={onBuyCredits}
          data-testid="button-credit-balance"
        >
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <div className="text-sm font-medium">
              {isAdmin ? "∞ Credits" : `${credits.toLocaleString()} Credits`}
            </div>
            {isLow && !isAdmin && (
              <div className="animate-pulse">
                <ArrowUp className="w-3 h-3" />
              </div>
            )}
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-2">
          <div className="font-semibold">
            {isAdmin ? "👑 Admin: Unlimited Credits!" :
             isCritical ? "🚨 Critical: Running out of credits!" :
             isLow ? "⚠️ Warning: Low on credits" :
             "✨ You're all set!"}
          </div>
          <div className="text-sm space-y-1">
            <div>Current balance: <strong>{isAdmin ? "∞" : credits} credits</strong></div>
            <Separator className="my-2" />
            <div className="text-xs opacity-80">
              <div>💬 Text posts: {CREDIT_COSTS.text} credit each</div>
              <div>🖼️ Image posts: {CREDIT_COSTS.image} credits each</div>
              <div>🎥 Video posts: {CREDIT_COSTS.video} credits each</div>
              <div>🚀 14-day campaigns: {CREDIT_COSTS.campaign} credits</div>
            </div>
          </div>
          {isLow && !isAdmin && (
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                Click to buy more credits →
              </div>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface HeaderProps {
  onMobileMenuClick?: () => void;
}

export default function Header({ onMobileMenuClick }: HeaderProps) {
  const [location, setLocation] = useLocation();
  const currentPage = pageData[location as keyof typeof pageData] || pageData["/"];
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  
  const { data: user } = useQuery<UserType>({
    queryKey: ["/api/user"],
  });
  
  const handleLogout = async () => {
    // Clear auth and redirect to login
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.href = '/';
    }
  };
  
  const getTierDisplay = (tier?: string) => {
    switch(tier) {
      case 'enterprise': return { name: 'Enterprise', icon: Crown, color: 'bg-purple-500' };
      case 'professional': return { name: 'Professional', icon: Star, color: 'bg-blue-500' };
      case 'starter': return { name: 'Starter', color: 'bg-green-500' };
      default: return { name: 'Free Trial', color: 'bg-gray-500' };
    }
  };
  
  const tierInfo = getTierDisplay(user?.tier);

  return (
    <header className="pt-6 pb-3 px-6">
      <div className="bg-card rounded-2xl border-2 border-primary px-6 py-4 relative shadow-[0_0_30px_hsl(var(--primary)/0.4),0_0_60px_hsl(var(--primary)/0.2)] overflow-visible w-full">
        <div className="absolute -inset-2 bg-primary/15 rounded-2xl blur-md -z-10"></div>
      <div className="flex items-center justify-between w-full">
        {/* Left side - Page title */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile menu button - only visible on mobile */}
          {onMobileMenuClick && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMobileMenuClick}
              className="md:hidden"
              data-testid="button-mobile-menu"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          )}
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground truncate">{currentPage.title}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">{currentPage.subtitle}</p>
          </div>
        </div>

        {/* Right side - All action items with proper spacing */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Credit Balance - responsive */}
          <div className="hidden sm:block">
            <CreditBalance 
              user={user} 
              onBuyCredits={() => setLocation('/billing')}
            />
          </div>
          {/* Mobile Credit Display */}
          <div className="block sm:hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation('/billing')}
                  className="px-2"
                  data-testid="button-mobile-credits"
                >
                  {user?.role === "admin" ? <Crown className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                  <span className="ml-1 text-sm font-bold">
                    {user?.role === "admin" ? "∞" : user?.credits || 0}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {user?.role === "admin" ? "∞ Credits - Admin" : `${user?.credits || 0} Credits - Tap to buy more`}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Theme Toggle - Hidden on mobile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="inline-flex items-center gap-2 px-3 py-2">
                    <Palette className="h-5 w-5" />
                    <span className="text-sm hidden sm:inline">Theme</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Change the app appearance</p>
                </TooltipContent>
              </Tooltip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Choose Theme</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setTheme('neon-pink');
                  toast({
                    title: "Theme Changed",
                    description: "Switched to Neon Pink theme",
                    duration: 2000,
                  });
                }}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span>Neon Pink</span>
                  {theme === 'neon-pink' && <div className="w-2 h-2 rounded-full bg-pink-500" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setTheme('neon-blue');
                  toast({
                    title: "Theme Changed",
                    description: "Switched to Neon Blue theme",
                    duration: 2000,
                  });
                }}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span>Neon Blue</span>
                  {theme === 'neon-blue' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setTheme('professional');
                  toast({
                    title: "Theme Changed",
                    description: "Switched to Professional theme",
                    duration: 2000,
                  });
                }}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span>Professional</span>
                  {theme === 'professional' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <NotificationsBell />

          {/* Quick Create Dropdown - Moved before User Account */}
          <DropdownMenu open={isQuickCreateOpen} onOpenChange={setIsQuickCreateOpen}>
            <DropdownMenuTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white shadow-lg transition-all hover:shadow-xl">
                <Plus className="w-4 h-4 mr-2" />
                Quick Create
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Create Content with AI
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                onClick={() => {
                  setLocation('/create?type=text');
                  setIsQuickCreateOpen(false);
                }}
                className="cursor-pointer"
                data-testid="menu-create-text"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span>Text Post</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {CREDIT_COSTS.text} credit
                  </Badge>
                </div>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={() => {
                  setLocation('/create?type=text-image');
                  setIsQuickCreateOpen(false);
                }}
                className="cursor-pointer"
                data-testid="menu-create-image"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-green-500" />
                    <span>Image + Text</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {CREDIT_COSTS.image} credits
                  </Badge>
                </div>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={() => {
                  setLocation('/create?type=text-video');
                  setIsQuickCreateOpen(false);
                }}
                className="cursor-pointer"
                data-testid="menu-create-video"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-purple-500" />
                    <span>Video + Text</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {CREDIT_COSTS.video} credits
                  </Badge>
                </div>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                onClick={() => {
                  setLocation('/calendar');
                  setIsQuickCreateOpen(false);
                }}
                className="cursor-pointer"
                data-testid="menu-schedule-post"
              >
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-orange-500" />
              <DropdownMenuItem
                onClick={() => {
                  setTheme('professional');
                  toast({
                    title: "Theme Changed",
                    description: "Switched to Professional theme",
                    duration: 2000,
                  });
                }}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span>Professional</span>
                  {theme === 'professional' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                </div>
              </DropdownMenuItem>

                  <span>Schedule Post</span>
                </div>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={() => {
                  setLocation('/campaigns');
                  setIsQuickCreateOpen(false);
                }}
                className="cursor-pointer"
                data-testid="menu-create-campaign"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-pink-500" />
                    <span>AI Campaign (7 days)</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {CREDIT_COSTS.campaign} credits
                  </Badge>
                </div>
              </DropdownMenuItem>
              
              {((user?.credits || 0) < 10) && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1">
                    <div className="flex items-center gap-2 text-xs text-amber-600">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Running low on credits?</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full mt-1"
                      onClick={() => {
                        setLocation('/billing');
                        setIsQuickCreateOpen(false);
                      }}
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      Buy More Credits
                    </Button>
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Account Dropdown - Positioned at far right */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative p-0 h-auto">
                <UserAvatar user={user} className="w-10 h-10" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-2 py-3 border-b">
                <p className="font-semibold">{user?.fullName || 'User'}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className={`${tierInfo.color} text-white`}>
                    {tierInfo.icon && <tierInfo.icon className="w-3 h-3 mr-1" />}
                    {tierInfo.name}
                  </Badge>
                  {user?.credits !== undefined && (
                    <Badge variant="outline">
                      {user?.role === "admin" ? "∞ Credits" : `${user.credits} Credits`}
                    </Badge>
                  )}
                </div>
              </div>

              <DropdownMenuItem onClick={() => setLocation('/settings')} className="cursor-pointer">
                <User className="w-4 h-4 mr-2" />
                Account Settings
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setLocation('/billing')} className="cursor-pointer">
                <CreditCard className="w-4 h-4 mr-2" />
                Billing & Upgrade
                {user?.tier === 'free' && (
                  <Badge variant="default" className="ml-auto bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    Upgrade
                  </Badge>
                )}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setLocation('/referrals')} className="cursor-pointer">
                <Gift className="w-4 h-4 mr-2" />
                Referral Program
                <Badge variant="outline" className="ml-auto">
                  New!
                </Badge>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setLocation('/help')} className="cursor-pointer">
                <HelpCircle className="w-4 h-4 mr-2" />
                Help & Support
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </div>
    </header>
  );
}
