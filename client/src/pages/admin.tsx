import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Bell, Send, Users, UserCheck, CreditCard, Activity, DollarSign, TrendingUp, Shield, 
  Edit, Trash2, Plus, Minus, Key, Mail, Ban, UserCog, RefreshCw, Save, X, AlertTriangle,
  Eye, EyeOff, Lock, Unlock, UserX, UserPlus, Pause, Play, MessageSquare, Clock, Calendar
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { User, CreditTransaction } from "@shared/schema";

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  deletedUsers: number;
  usersByTier: {
    free: number;
    starter: number;
    professional: number;
    business: number;
    enterprise: number;
  };
  totalCreditsInSystem: number;
  totalCreditsUsed: number;
  averageCreditsPerUser: number;
  totalPosts: number;
  totalCampaigns: number;
  totalRevenue: number;
  totalTransactions: number;
}

interface Transaction extends CreditTransaction {
  userName?: string;
  userEmail?: string;
}

interface EnhancedUser extends User {
  isOnline?: boolean;
  trialDaysRemaining?: number | null;
  trialStatus?: 'active' | 'expired' | null;
}

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Check if current user is admin
  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  // Get all users with enhanced info - auto-refresh every 5 seconds
  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery<EnhancedUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: currentUser?.role === "admin",
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    refetchIntervalInBackground: true, // Continue refreshing even when tab is not focused
  });

  // Get admin stats - auto-refresh every 5 seconds
  const { data: stats, refetch: refetchStats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: currentUser?.role === "admin",
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    refetchIntervalInBackground: true,
  });

  // Get all transactions
  const { data: transactions = [], refetch: refetchTransactions } = useQuery<Transaction[]>({
    queryKey: ["/api/admin/transactions"],
    enabled: currentUser?.role === "admin",
    refetchInterval: 10000, // Auto-refresh every 10 seconds for transactions
  });

  // State for modals and forms
  const [selectedUser, setSelectedUser] = useState<EnhancedUser | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditHistoryModalOpen, setCreditHistoryModalOpen] = useState(false);
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  
  // Form states
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditAction, setCreditAction] = useState<"grant" | "deduct" | "reset">("grant");
  const [creditReason, setCreditReason] = useState("");
  const [selectedTier, setSelectedTier] = useState("");
  const [userCreditHistory, setUserCreditHistory] = useState<CreditTransaction[]>([]);
  const [pauseReason, setPauseReason] = useState("");
  const [messageForm, setMessageForm] = useState({ title: "", message: "", requiresPopup: true });
  const [trialDaysToAdd, setTrialDaysToAdd] = useState("");
  
  // Create user form state
  const [createUserForm, setCreateUserForm] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    businessName: "",
    tier: "free",
    credits: "50",
    isAdmin: false,
  });
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Notification form state
  const [notificationForm, setNotificationForm] = useState({
    userId: "all" as string,
    title: "",
    message: "",
    type: "admin_message" as string,
    actionUrl: "",
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof createUserForm) => {
      return await apiRequest("POST", "/api/admin/users", {
        ...userData,
        credits: parseInt(userData.credits) || 50,
      });
    },
    onSuccess: () => {
      toast({ title: "User created successfully" });
      refetchUsers();
      refetchStats();
      setCreateUserModalOpen(false);
      // Reset form
      setCreateUserForm({
        username: "",
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        businessName: "",
        tier: "free",
        credits: "50",
        isAdmin: false,
      });
      setShowCreatePassword(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating user",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<User> }) => {
      return await apiRequest("PATCH", `/api/admin/users/${id}`, updates);
    },
    onSuccess: () => {
      toast({ title: "User updated successfully" });
      refetchUsers();
      refetchStats();
      setEditModalOpen(false);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update email mutation
  const updateEmailMutation = useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email: string }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/update-email`, { email });
    },
    onSuccess: () => {
      toast({ title: "Email updated successfully" });
      refetchUsers();
      setEmailModalOpen(false);
      setNewEmail("");
    },
    onError: (error: any) => {
      toast({
        title: "Error updating email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update password mutation
  const updatePasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/update-password`, { password });
    },
    onSuccess: () => {
      toast({ title: "Password updated successfully" });
      setPasswordModalOpen(false);
      setNewPassword("");
      setShowPassword(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating password",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle admin mutation
  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/toggle-admin`, { isAdmin });
    },
    onSuccess: () => {
      toast({ title: "Admin status updated" });
      refetchUsers();
      refetchStats();
      // Force refresh the current user query so sidebar updates instantly
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating admin status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Grant credits mutation
  const grantCreditsMutation = useMutation({
    mutationFn: async ({ userId, amount, reason }: { userId: string; amount: number; reason: string }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/grant-credits`, { amount, reason });
    },
    onSuccess: () => {
      toast({ title: "Credits granted successfully" });
      refetchUsers();
      refetchTransactions();
      refetchStats();
      setCreditModalOpen(false);
      setCreditAmount("");
      setCreditReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error granting credits",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Deduct credits mutation
  const deductCreditsMutation = useMutation({
    mutationFn: async ({ userId, amount, reason }: { userId: string; amount: number; reason: string }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/deduct-credits`, { amount, reason });
    },
    onSuccess: () => {
      toast({ title: "Credits deducted successfully" });
      refetchUsers();
      refetchTransactions();
      refetchStats();
      setCreditModalOpen(false);
      setCreditAmount("");
      setCreditReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error deducting credits",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reset credits mutation
  const resetCreditsMutation = useMutation({
    mutationFn: async ({ userId, amount }: { userId: string; amount: number }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/reset-credits`, { amount });
    },
    onSuccess: () => {
      toast({ title: "Credits reset successfully" });
      refetchUsers();
      refetchTransactions();
      refetchStats();
      setCreditModalOpen(false);
      setCreditAmount("");
    },
    onError: (error: any) => {
      toast({
        title: "Error resetting credits",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Freeze/unfreeze account mutation
  const freezeAccountMutation = useMutation({
    mutationFn: async ({ userId, frozen, reason }: { userId: string; frozen: boolean; reason: string }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/freeze`, { frozen, reason });
    },
    onSuccess: (_, variables) => {
      toast({ title: `Account ${variables.frozen ? "frozen" : "unfrozen"} successfully` });
      refetchUsers();
      refetchStats();
    },
    onError: (error: any) => {
      toast({
        title: "Error updating account status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Suspend account mutation
  const suspendAccountMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/suspend`, { reason });
    },
    onSuccess: () => {
      toast({ title: "Account suspended successfully" });
      refetchUsers();
      refetchStats();
    },
    onError: (error: any) => {
      toast({
        title: "Error suspending account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Pause user mutation
  const pauseUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/pause`, { reason });
    },
    onSuccess: () => {
      toast({ title: "User account paused successfully" });
      refetchUsers();
      setPauseModalOpen(false);
      setPauseReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error pausing account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Unpause user mutation
  const unpauseUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/unpause`);
    },
    onSuccess: () => {
      toast({ title: "User account unpaused successfully" });
      refetchUsers();
    },
    onError: (error: any) => {
      toast({
        title: "Error unpausing account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ userId, title, message, requiresPopup }: { userId: string; title: string; message: string; requiresPopup: boolean }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/message`, { title, message, requiresPopup });
    },
    onSuccess: () => {
      toast({ title: "Message sent successfully" });
      setMessageModalOpen(false);
      setMessageForm({ title: "", message: "", requiresPopup: true });
    },
    onError: (error: any) => {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update trial mutation
  const updateTrialMutation = useMutation({
    mutationFn: async ({ userId, daysToAdd }: { userId: string; daysToAdd: number }) => {
      return await apiRequest("PATCH", `/api/admin/users/${userId}/trial`, { daysToAdd });
    },
    onSuccess: () => {
      toast({ title: "Trial period updated successfully" });
      refetchUsers();
      setTrialModalOpen(false);
      setTrialDaysToAdd("");
    },
    onError: (error: any) => {
      toast({
        title: "Error updating trial",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Change tier mutation
  const changeTierMutation = useMutation({
    mutationFn: async ({ userId, tier, grantCredits }: { userId: string; tier: string; grantCredits: boolean }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/change-tier`, { tier, grantCredits });
    },
    onSuccess: () => {
      toast({ title: "Tier changed successfully" });
      refetchUsers();
      refetchStats();
      setEditModalOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error changing tier",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async ({ userId, permanent }: { userId: string; permanent: boolean }) => {
      return await apiRequest("DELETE", `/api/admin/users/${userId}?permanent=${permanent}`);
    },
    onSuccess: (_, variables) => {
      toast({ title: variables.permanent ? "User permanently deleted" : "User account deleted" });
      refetchUsers();
      refetchStats();
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send notification mutation
  const sendNotificationMutation = useMutation({
    mutationFn: async (data: typeof notificationForm) => {
      return await apiRequest("POST", "/api/notifications", {
        userId: data.userId === "all" ? undefined : data.userId,
        title: data.title,
        message: data.message,
        type: data.type,
        actionUrl: data.actionUrl || undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: "Notification Sent",
        description: notificationForm.userId === "all" ? "Global notification sent to all users" : "Notification sent to user",
      });
      setNotificationForm({
        userId: "all",
        title: "",
        message: "",
        type: "admin_message",
        actionUrl: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send notification",
        variant: "destructive",
      });
    },
  });

  // Load credit history for a user
  const loadCreditHistory = async (userId: string) => {
    try {
      const history = await apiRequest("GET", `/api/admin/users/${userId}/credit-history`);
      setUserCreditHistory(history);
      setCreditHistoryModalOpen(true);
    } catch (error: any) {
      toast({
        title: "Error loading credit history",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Handle credit action
  const handleCreditAction = () => {
    if (!selectedUser || !creditAmount) return;
    
    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    
    if (creditAction === "grant") {
      grantCreditsMutation.mutate({ userId: selectedUser.id, amount, reason: creditReason });
    } else if (creditAction === "deduct") {
      deductCreditsMutation.mutate({ userId: selectedUser.id, amount, reason: creditReason });
    } else if (creditAction === "reset") {
      resetCreditsMutation.mutate({ userId: selectedUser.id, amount });
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500";
      case "suspended": return "bg-yellow-500";
      case "frozen": return "bg-blue-500";
      case "deleted": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  // Get tier color
  const getTierColor = (tier: string) => {
    switch (tier) {
      case "free": return "bg-gray-500";
      case "starter": return "bg-blue-500";
      case "professional": return "bg-purple-500";
      case "business": return "bg-orange-500";
      case "enterprise": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to access the admin panel.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Complete control over all user accounts</p>
        </div>
        <Button onClick={() => { refetchUsers(); refetchStats(); refetchTransactions(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh All
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeUsers} active, {stats.suspendedUsers} suspended
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCreditsInSystem.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Avg {stats.averageCreditsPerUser} per user
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(stats.totalRevenue || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalTransactions} transactions
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Content Created</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPosts}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalCampaigns} campaigns
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="advanced">God Powers</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>
                    Manage all user accounts with full control
                  </CardDescription>
                </div>
                
                {/* Create New User Dialog */}
                <Dialog open={createUserModalOpen} onOpenChange={setCreateUserModalOpen}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2" data-testid="button-create-user">
                      <UserPlus className="h-4 w-4" />
                      Create New User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Create New User</DialogTitle>
                      <DialogDescription>
                        Create a new user account with specified settings
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="username">Username *</Label>
                          <Input
                            id="username"
                            value={createUserForm.username}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, username: e.target.value })}
                            placeholder="johndoe"
                            required
                            data-testid="input-create-username"
                          />
                        </div>
                        <div>
                          <Label htmlFor="email">Email *</Label>
                          <Input
                            id="email"
                            type="email"
                            value={createUserForm.email}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                            placeholder="john@example.com"
                            required
                            data-testid="input-create-email"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="password">Password * (min 6 characters)</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showCreatePassword ? "text" : "password"}
                            value={createUserForm.password}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                            placeholder="Enter password"
                            required
                            data-testid="input-create-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowCreatePassword(!showCreatePassword)}
                            data-testid="button-toggle-create-password"
                          >
                            {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            value={createUserForm.firstName}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, firstName: e.target.value })}
                            placeholder="John"
                            data-testid="input-create-first-name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            value={createUserForm.lastName}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, lastName: e.target.value })}
                            placeholder="Doe"
                            data-testid="input-create-last-name"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="businessName">Business Name</Label>
                        <Input
                          id="businessName"
                          value={createUserForm.businessName}
                          onChange={(e) => setCreateUserForm({ ...createUserForm, businessName: e.target.value })}
                          placeholder="Acme Corp"
                          data-testid="input-create-business-name"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="tier">Subscription Tier</Label>
                          <Select
                            value={createUserForm.tier}
                            onValueChange={(value) => setCreateUserForm({ ...createUserForm, tier: value })}
                          >
                            <SelectTrigger data-testid="select-create-tier">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="starter">Starter</SelectItem>
                              <SelectItem value="professional">Professional</SelectItem>
                              <SelectItem value="business">Business</SelectItem>
                              <SelectItem value="enterprise">Business</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="credits">Initial Credits</Label>
                          <Input
                            id="credits"
                            type="number"
                            value={createUserForm.credits}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, credits: e.target.value })}
                            min="0"
                            data-testid="input-create-credits"
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="isAdmin"
                          checked={createUserForm.isAdmin}
                          onCheckedChange={(checked) => setCreateUserForm({ ...createUserForm, isAdmin: checked })}
                          data-testid="switch-create-admin"
                        />
                        <Label htmlFor="isAdmin" className="font-normal cursor-pointer">
                          Grant admin privileges
                        </Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setCreateUserModalOpen(false);
                          // Reset form
                          setCreateUserForm({
                            username: "",
                            email: "",
                            password: "",
                            firstName: "",
                            lastName: "",
                            businessName: "",
                            tier: "free",
                            credits: "50",
                            isAdmin: false,
                          });
                          setShowCreatePassword(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          // Basic validation
                          if (!createUserForm.username || !createUserForm.email || !createUserForm.password) {
                            toast({
                              title: "Missing required fields",
                              description: "Username, email, and password are required",
                              variant: "destructive",
                            });
                            return;
                          }
                          if (createUserForm.password.length < 6) {
                            toast({
                              title: "Password too short",
                              description: "Password must be at least 6 characters",
                              variant: "destructive",
                            });
                            return;
                          }
                          createUserMutation.mutate(createUserForm);
                        }}
                        disabled={createUserMutation.isPending}
                        data-testid="button-submit-create-user"
                      >
                        {createUserMutation.isPending ? "Creating..." : "Create User"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <div className="h-[600px] overflow-y-auto">
                  <Table className="min-w-[1400px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">User</TableHead>
                        <TableHead className="min-w-[200px]">Email</TableHead>
                        <TableHead className="min-w-[100px]">Tier</TableHead>
                        <TableHead className="min-w-[80px]">Credits</TableHead>
                        <TableHead className="min-w-[100px]">Status</TableHead>
                        <TableHead className="min-w-[80px]">Online</TableHead>
                        <TableHead className="min-w-[120px]">Trial</TableHead>
                        <TableHead className="min-w-[80px]">Admin</TableHead>
                        <TableHead className="min-w-[700px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{user.fullName || user.username}</p>
                            <p className="text-sm text-muted-foreground">@{user.username}</p>
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge className={getTierColor(user.tier)}>
                            {user.tier}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.credits}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(user.accountStatus)}>
                            {user.accountStatus}
                            {user.isPaused && " (Paused)"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${user.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                            <span className="text-sm">{user.isOnline ? 'Online' : 'Offline'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.tier === 'free' && user.trialDaysRemaining !== null ? (
                            <div className="text-sm">
                              {user.trialStatus === 'active' ? (
                                <span className={user.trialDaysRemaining <= 3 ? 'text-red-600 font-medium' : ''}>
                                  {user.trialDaysRemaining} days left
                                </span>
                              ) : (
                                <span className="text-red-600 font-medium">Expired</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={user.role === "admin"}
                            onCheckedChange={(checked) => {
                              toggleAdminMutation.mutate({ userId: user.id, isAdmin: checked });
                            }}
                            disabled={user.id === currentUser.id}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-nowrap">
                            {/* Edit User Dialog */}
                            <Dialog open={editModalOpen && selectedUser?.id === user.id} onOpenChange={setEditModalOpen}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setEditForm(user);
                                  }}
                                  data-testid={`button-edit-user-${user.id}`}
                                >
                                  <Edit className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Edit User: {user.fullName || user.username}</DialogTitle>
                                  <DialogDescription>
                                    Modify user details and settings
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <Label>First Name</Label>
                                      <Input
                                        value={editForm.firstName || ""}
                                        onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                                        data-testid="input-first-name"
                                      />
                                    </div>
                                    <div>
                                      <Label>Last Name</Label>
                                      <Input
                                        value={editForm.lastName || ""}
                                        onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                                        data-testid="input-last-name"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Business Name</Label>
                                    <Input
                                      value={editForm.businessName || ""}
                                      onChange={(e) => setEditForm({ ...editForm, businessName: e.target.value })}
                                      data-testid="input-business-name"
                                    />
                                  </div>
                                  <div>
                                    <Label>Tier</Label>
                                    <Select
                                      value={editForm.tier}
                                      onValueChange={(value) => setEditForm({ ...editForm, tier: value })}
                                    >
                                      <SelectTrigger data-testid="select-tier">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="free">Free</SelectItem>
                                        <SelectItem value="starter">Starter</SelectItem>
                                        <SelectItem value="professional">Professional</SelectItem>
                                        <SelectItem value="business">Business</SelectItem>
                                        <SelectItem value="enterprise">Business</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label>Account Status</Label>
                                    <Select
                                      value={editForm.accountStatus}
                                      onValueChange={(value) => setEditForm({ ...editForm, accountStatus: value })}
                                    >
                                      <SelectTrigger data-testid="select-status">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="suspended">Suspended</SelectItem>
                                        <SelectItem value="frozen">Frozen</SelectItem>
                                        <SelectItem value="deleted">Deleted</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setEditModalOpen(false)}>
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      updateUserMutation.mutate({ id: user.id, updates: editForm });
                                    }}
                                    data-testid="button-save-changes"
                                  >
                                    Save Changes
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            {/* Email Dialog */}
                            <Dialog open={emailModalOpen && selectedUser?.id === user.id} onOpenChange={setEmailModalOpen}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setNewEmail(user.email || "");
                                  }}
                                  data-testid={`button-email-${user.id}`}
                                >
                                  <Mail className="h-4 w-4 mr-1" />
                                  Email
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Update Email</DialogTitle>
                                  <DialogDescription>
                                    Change email for {user.fullName || user.username}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                  <div>
                                    <Label>New Email Address</Label>
                                    <Input
                                      type="email"
                                      value={newEmail}
                                      onChange={(e) => setNewEmail(e.target.value)}
                                      placeholder="user@example.com"
                                      data-testid="input-new-email"
                                    />
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setEmailModalOpen(false)}>
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      updateEmailMutation.mutate({ userId: user.id, email: newEmail });
                                    }}
                                    data-testid="button-update-email"
                                  >
                                    Update Email
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            {/* Password Dialog */}
                            <Dialog open={passwordModalOpen && selectedUser?.id === user.id} onOpenChange={setPasswordModalOpen}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setNewPassword("");
                                  }}
                                  data-testid={`button-password-${user.id}`}
                                >
                                  <Key className="h-4 w-4 mr-1" />
                                  Password
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Reset Password</DialogTitle>
                                  <DialogDescription>
                                    Set a new password for {user.fullName || user.username}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                  <div>
                                    <Label>New Password</Label>
                                    <div className="relative">
                                      <Input
                                        type={showPassword ? "text" : "password"}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Enter new password"
                                        data-testid="input-new-password"
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3"
                                        onClick={() => setShowPassword(!showPassword)}
                                        data-testid="button-toggle-password"
                                      >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                      </Button>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      Minimum 6 characters
                                    </p>
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setPasswordModalOpen(false)}>
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      updatePasswordMutation.mutate({ userId: user.id, password: newPassword });
                                    }}
                                    disabled={newPassword.length < 6}
                                    data-testid="button-update-password"
                                  >
                                    Update Password
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            {/* Credits Dialog */}
                            <Dialog open={creditModalOpen && selectedUser?.id === user.id} onOpenChange={setCreditModalOpen}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setCreditAmount("");
                                    setCreditReason("");
                                    setCreditAction("grant");
                                  }}
                                  data-testid={`button-credits-${user.id}`}
                                >
                                  <CreditCard className="h-4 w-4 mr-1" />
                                  Credits
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Manage Credits</DialogTitle>
                                  <DialogDescription>
                                    Current balance: {user.credits} credits
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                  <div>
                                    <Label>Action</Label>
                                    <Select value={creditAction} onValueChange={(v: any) => setCreditAction(v)}>
                                      <SelectTrigger data-testid="select-credit-action">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="grant">Grant Credits</SelectItem>
                                        <SelectItem value="deduct">Deduct Credits</SelectItem>
                                        <SelectItem value="reset">Reset to Amount</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label>Amount</Label>
                                    <Input
                                      type="number"
                                      value={creditAmount}
                                      onChange={(e) => setCreditAmount(e.target.value)}
                                      placeholder="Enter amount"
                                      data-testid="input-credit-amount"
                                    />
                                  </div>
                                  {creditAction !== "reset" && (
                                    <div>
                                      <Label>Reason</Label>
                                      <Textarea
                                        value={creditReason}
                                        onChange={(e) => setCreditReason(e.target.value)}
                                        placeholder="Optional reason"
                                        data-testid="textarea-credit-reason"
                                      />
                                    </div>
                                  )}
                                </div>
                                <DialogFooter className="gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => loadCreditHistory(user.id)}
                                    data-testid="button-view-history"
                                  >
                                    View History
                                  </Button>
                                  <Button variant="outline" onClick={() => setCreditModalOpen(false)}>
                                    Cancel
                                  </Button>
                                  <Button onClick={handleCreditAction} data-testid="button-apply-credits">
                                    Apply
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            {/* Pause/Unpause User */}
                            {user.isPaused ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => unpauseUserMutation.mutate(user.id)}
                                data-testid={`button-unpause-${user.id}`}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Unpause
                              </Button>
                            ) : (
                              <Dialog
                                open={pauseModalOpen && selectedUser?.id === user.id}
                                onOpenChange={(open) => {
                                  setPauseModalOpen(open);
                                  if (!open) {
                                    setSelectedUser(null);
                                    setPauseReason("");
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedUser(user)}
                                    data-testid={`button-pause-${user.id}`}
                                  >
                                    <Pause className="h-4 w-4 mr-1" />
                                    Pause
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Pause User Account</DialogTitle>
                                    <DialogDescription>
                                      Pausing {user.fullName || user.username}'s account
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <Label>Reason for pausing</Label>
                                      <Textarea
                                        value={pauseReason}
                                        onChange={(e) => setPauseReason(e.target.value)}
                                        placeholder="Enter reason for pausing this account"
                                        rows={3}
                                        data-testid="textarea-pause-reason"
                                      />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => setPauseModalOpen(false)}>
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={() => {
                                        if (pauseReason.trim()) {
                                          pauseUserMutation.mutate({ userId: user.id, reason: pauseReason });
                                        } else {
                                          toast({
                                            title: "Reason required",
                                            description: "Please provide a reason for pausing",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                      data-testid="button-confirm-pause"
                                    >
                                      Pause Account
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            )}

                            {/* Send Message */}
                            <Dialog
                              open={messageModalOpen && selectedUser?.id === user.id}
                              onOpenChange={(open) => {
                                setMessageModalOpen(open);
                                if (!open) {
                                  setSelectedUser(null);
                                  setMessageForm({ title: "", message: "", requiresPopup: true });
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedUser(user)}
                                  data-testid={`button-message-${user.id}`}
                                >
                                  <MessageSquare className="h-4 w-4 mr-1" />
                                  Message
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Send Message to User</DialogTitle>
                                  <DialogDescription>
                                    Send a message to {user.fullName || user.username}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label>Title</Label>
                                    <Input
                                      value={messageForm.title}
                                      onChange={(e) => setMessageForm({ ...messageForm, title: e.target.value })}
                                      placeholder="Message title"
                                      data-testid="input-message-title"
                                    />
                                  </div>
                                  <div>
                                    <Label>Message</Label>
                                    <Textarea
                                      value={messageForm.message}
                                      onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })}
                                      placeholder="Message content"
                                      rows={4}
                                      data-testid="textarea-message-content"
                                    />
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      checked={messageForm.requiresPopup}
                                      onCheckedChange={(checked) => setMessageForm({ ...messageForm, requiresPopup: checked })}
                                      data-testid="switch-popup"
                                    />
                                    <Label className="font-normal cursor-pointer">
                                      Show as popup notification
                                    </Label>
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setMessageModalOpen(false)}>
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      if (messageForm.title && messageForm.message) {
                                        sendMessageMutation.mutate({
                                          userId: user.id,
                                          title: messageForm.title,
                                          message: messageForm.message,
                                          requiresPopup: messageForm.requiresPopup,
                                        });
                                      } else {
                                        toast({
                                          title: "Missing fields",
                                          description: "Title and message are required",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    data-testid="button-send-message"
                                  >
                                    Send Message
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            {/* Extend Trial */}
                            {user.tier === 'free' && (
                              <Dialog
                                open={trialModalOpen && selectedUser?.id === user.id}
                                onOpenChange={(open) => {
                                  setTrialModalOpen(open);
                                  if (!open) {
                                    setSelectedUser(null);
                                    setTrialDaysToAdd("");
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedUser(user)}
                                    data-testid={`button-trial-${user.id}`}
                                  >
                                    <Calendar className="h-4 w-4 mr-1" />
                                    Trial
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Manage Trial Period</DialogTitle>
                                    <DialogDescription>
                                      Extend trial for {user.fullName || user.username}
                                      {user.trialDaysRemaining !== null && (
                                        <div className="mt-2">
                                          Current trial: {user.trialDaysRemaining} days remaining
                                        </div>
                                      )}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <Label>Days to add</Label>
                                      <Input
                                        type="number"
                                        value={trialDaysToAdd}
                                        onChange={(e) => setTrialDaysToAdd(e.target.value)}
                                        placeholder="Number of days to add"
                                        min="1"
                                        data-testid="input-trial-days"
                                      />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => setTrialModalOpen(false)}>
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={() => {
                                        const days = parseInt(trialDaysToAdd);
                                        if (days > 0) {
                                          updateTrialMutation.mutate({ userId: user.id, daysToAdd: days });
                                        } else {
                                          toast({
                                            title: "Invalid days",
                                            description: "Please enter a valid number of days",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                      data-testid="button-extend-trial"
                                    >
                                      Extend Trial
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            )}

                            {/* Delete User */}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={user.isAdmin}
                                  data-testid={`button-delete-${user.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User Account</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Choose deletion type for {user.fullName || user.username}:
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      deleteUserMutation.mutate({ userId: user.id, permanent: false });
                                    }}
                                    data-testid="button-soft-delete"
                                  >
                                    Soft Delete
                                  </Button>
                                  <AlertDialogAction
                                    className="bg-red-600 hover:bg-red-700"
                                    onClick={() => {
                                      deleteUserMutation.mutate({ userId: user.id, permanent: true });
                                    }}
                                    data-testid="button-permanent-delete"
                                  >
                                    Permanent Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced God Powers Tab */}
        <TabsContent value="advanced" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Real-time User Monitoring */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Real-time Users
                </CardTitle>
                <CardDescription>
                  Monitor user activity in real-time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                    // TODO: Implement real-time user monitoring
                    toast({ title: "Real-time monitoring activated" });
                  }}
                >
                  View Live Activity
                </Button>
              </CardContent>
            </Card>

            {/* System Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  System Health
                </CardTitle>
                <CardDescription>
                  Monitor system performance and alerts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                    // TODO: Implement system health monitoring
                    toast({ title: "System health check initiated" });
                  }}
                >
                  Health Dashboard
                </Button>
              </CardContent>
            </Card>

            {/* Urgent Messaging */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Urgent Messaging
                </CardTitle>
                <CardDescription>
                  Send urgent popup messages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                    // TODO: Implement urgent messaging
                    toast({ title: "Urgent message system ready" });
                  }}
                >
                  Send Urgent Alert
                </Button>
              </CardContent>
            </Card>

            {/* Broadcast Messages */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Broadcast
                </CardTitle>
                <CardDescription>
                  Send messages to all users
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                    // TODO: Implement broadcast messaging
                    toast({ title: "Broadcast system activated" });
                  }}
                >
                  Broadcast Message
                </Button>
              </CardContent>
            </Card>

            {/* User Impersonation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCog className="h-5 w-5" />
                  Impersonation
                </CardTitle>
                <CardDescription>
                  Login as any user
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                    // TODO: Implement user impersonation
                    toast({ title: "Impersonation mode ready" });
                  }}
                >
                  Impersonate User
                </Button>
              </CardContent>
            </Card>

            {/* Bulk Operations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Bulk Operations
                </CardTitle>
                <CardDescription>
                  Perform actions on multiple users
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                    // TODO: Implement bulk operations
                    toast({ title: "Bulk operations panel ready" });
                  }}
                >
                  Bulk Actions
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Advanced Search */}
          <Card>
            <CardHeader>
              <CardTitle>Advanced User Search</CardTitle>
              <CardDescription>
                Search and filter users with advanced criteria
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Search Query</Label>
                  <Input placeholder="Search by name, email, username..." />
                </div>
                <div>
                  <Label>Tier Filter</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="All tiers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tiers</SelectItem>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="enterprise">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status Filter</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="frozen">Frozen</SelectItem>
                      <SelectItem value="deleted">Deleted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button>Search Users</Button>
                <Button variant="outline">Clear Filters</Button>
                <Button variant="outline">Export Results</Button>
              </div>
            </CardContent>
          </Card>

          {/* Force Password Reset */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-red-500" />
                Force Password Reset
              </CardTitle>
              <CardDescription>
                Force any user to reset their password on next login
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Select User</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.fullName || user.username} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reason</Label>
                  <Input placeholder="Security breach, compromised account..." />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="destructive">Force Password Reset</Button>
                <Button variant="outline">Send Notification</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Credit Transactions</CardTitle>
              <CardDescription>
                View all credit transactions across the platform
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <div className="h-[600px] overflow-y-auto">
                  <Table className="min-w-[900px]">
                    <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Date</TableHead>
                      <TableHead className="min-w-[180px]">User</TableHead>
                      <TableHead className="min-w-[120px]">Type</TableHead>
                      <TableHead className="min-w-[100px]">Amount</TableHead>
                      <TableHead className="min-w-[250px]">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          {new Date(transaction.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{transaction.userName}</p>
                            <p className="text-sm text-muted-foreground">{transaction.userEmail}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{transaction.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={transaction.amount > 0 ? "text-green-600" : "text-red-600"}>
                            {transaction.amount > 0 ? "+" : ""}{transaction.amount}
                          </span>
                        </TableCell>
                        <TableCell>{transaction.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Send Notification</CardTitle>
              <CardDescription>
                Send notifications to all users or specific users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label>Target</Label>
                  <Select 
                    value={notificationForm.userId} 
                    onValueChange={(value) => setNotificationForm({ ...notificationForm, userId: value })}
                  >
                    <SelectTrigger data-testid="select-notification-target">
                      <SelectValue placeholder="Select target" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.fullName || user.username} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Title</Label>
                  <Input
                    value={notificationForm.title}
                    onChange={(e) => setNotificationForm({ ...notificationForm, title: e.target.value })}
                    placeholder="Notification title"
                    data-testid="input-notification-title"
                  />
                </div>
                
                <div>
                  <Label>Message</Label>
                  <Textarea
                    value={notificationForm.message}
                    onChange={(e) => setNotificationForm({ ...notificationForm, message: e.target.value })}
                    placeholder="Notification message"
                    rows={4}
                    data-testid="textarea-notification-message"
                  />
                </div>
                
                <div>
                  <Label>Type</Label>
                  <Select 
                    value={notificationForm.type} 
                    onValueChange={(value) => setNotificationForm({ ...notificationForm, type: value })}
                  >
                    <SelectTrigger data-testid="select-notification-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin_message">Admin Message</SelectItem>
                      <SelectItem value="system_update">System Update</SelectItem>
                      <SelectItem value="feature_announcement">Feature Announcement</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Action URL (Optional)</Label>
                  <Input
                    value={notificationForm.actionUrl}
                    onChange={(e) => setNotificationForm({ ...notificationForm, actionUrl: e.target.value })}
                    placeholder="https://example.com"
                    data-testid="input-action-url"
                  />
                </div>
              </div>
              
              <Button
                onClick={() => sendNotificationMutation.mutate(notificationForm)}
                disabled={!notificationForm.title || !notificationForm.message}
                className="w-full"
                data-testid="button-send-notification"
              >
                <Send className="mr-2 h-4 w-4" />
                Send Notification
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Credit History Modal */}
      <Dialog open={creditHistoryModalOpen} onOpenChange={setCreditHistoryModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Credit History</DialogTitle>
            <DialogDescription>
              Transaction history for {selectedUser?.fullName || selectedUser?.username}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userCreditHistory.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      {new Date(transaction.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{transaction.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={transaction.amount > 0 ? "text-green-600" : "text-red-600"}>
                        {transaction.amount > 0 ? "+" : ""}{transaction.amount}
                      </span>
                    </TableCell>
                    <TableCell>{transaction.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
