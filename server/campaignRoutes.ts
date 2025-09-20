import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from './auth';
import type { IStorage } from './storage';
import { saveToLibrary } from './library';
import { generateHighQualityPost } from './content/quality';
import { PostType } from './content/templates';
import { Platform } from './content/config';
import { BrandProfile } from '@shared/schema';
import { generateImage } from './ai/image';

// Declare global campaign progress tracking
declare global {
  var campaignProgress: Record<string, {
    total: number;
    current: number;
    status: string;
    posts: any[];
    userId?: string;
  }>;
}

const generateCampaignSchema = z.object({
  prompt: z.string().min(1, "Campaign prompt/theme is required"),
  start_date: z.string().datetime(),
  cadence: z.enum(["2_per_day_7_days"]).default("2_per_day_7_days"),
  businessName: z.string().optional(),
  productName: z.string().optional(),
  targetAudience: z.string().optional(),
  brandTone: z.string().optional(),
  keyMessages: z.array(z.string()).optional(),
  callToAction: z.string().optional(),
});

const applyCampaignScheduleSchema = z.object({
  morningSlot: z.string().regex(/^\d{2}:\d{2}$/).default("10:00"),
  afternoonSlot: z.string().regex(/^\d{2}:\d{2}$/).default("16:00"),
  timezone: z.string().default("UTC"),
});

export function createCampaignRoutes(storage: IStorage) {
  const router = Router();

  // Helper function to generate campaign posts in the background
  async function generateCampaignPostsAsync(
    campaignId: string,
    userId: string,
    params: any,
    brandProfile: BrandProfile,
    storage: IStorage
  ) {
    const progressKey = `campaign_progress_${campaignId}`;
    const posts = [];
    const startDate = new Date(params.start_date);
    const morningHour = 10;
    const afternoonHour = 16;
    
    // 14 unique content formulas for maximum variety
    const contentFormulas = [
      { type: 'hook', formula: 'Did you know that [surprising stat]? Here\'s how [solution]...', tone: 'curious' },
      { type: 'problem_agitate', formula: 'Struggling with [problem]? You\'re not alone. [Agitate]. But there\'s hope...', tone: 'empathetic' },
      { type: 'transformation', formula: 'From [before state] to [after state] in just [timeframe]. Here\'s the secret...', tone: 'inspiring' },
      { type: 'social_proof', formula: '[Number] businesses already [achievement]. Join them by...', tone: 'confident' },
      { type: 'myth_buster', formula: 'MYTH: [common belief]. TRUTH: [reality]. Here\'s what really works...', tone: 'authoritative' },
      { type: 'behind_scenes', formula: 'Ever wondered how we [process]? Take a peek behind the curtain...', tone: 'personal' },
      { type: 'customer_story', formula: 'Meet [customer type] who [achievement] using [product]. Their secret?', tone: 'storytelling' },
      { type: 'quick_win', formula: '5-minute hack: [Quick solution] that delivers [benefit] instantly', tone: 'actionable' },
      { type: 'comparison', formula: 'Old way: [traditional]. New way: [your solution]. The difference is...', tone: 'educational' },
      { type: 'urgency', formula: 'Only [number] days left to [benefit]. Don\'t miss out on...', tone: 'urgent' },
      { type: 'education', formula: 'The complete guide to [topic]: Everything you need to know about...', tone: 'expert' },
      { type: 'controversy', formula: 'Unpopular opinion: [controversial take]. Here\'s why I\'m right...', tone: 'bold' },
      { type: 'prediction', formula: 'By [year], [industry] will [change]. Prepare now by...', tone: 'visionary' },
      { type: 'checklist', formula: '✓ [item 1] ✓ [item 2] ✓ [item 3]. Which one are you missing?', tone: 'systematic' }
    ];
    
    const platforms: Platform[] = ['instagram', 'facebook', 'x'];
    let postIndex = 0;
    const priorCaptions: string[] = [];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    try {
      for (let day = 0; day < 7; day++) {
        for (let slot = 0; slot < 2; slot++) {
          const scheduledDate = new Date(startDate);
          scheduledDate.setDate(startDate.getDate() + day);
          scheduledDate.setHours(slot === 0 ? morningHour : afternoonHour, 0, 0, 0);
          
          const formula = contentFormulas[postIndex % contentFormulas.length];
          const platform = platforms[postIndex % platforms.length];

          // Generate content using the specific formula
          let content = '';
          let hashtags: string[] = [];

          try {
            const result = await generateHighQualityPost({
              platform,
              postType: formula.type as any,
              brand: brandProfile,
              campaignTheme: params.prompt,
              product: params.productName,
              desiredTone: formula.tone as any,
              callToAction: params.callToAction,
              priorCaptions,
              formula: formula.formula // Add formula to guide generation
            });
            
            if (result.ok) {
              content = result.best.caption;
              hashtags = result.best.hashtags;
              if (result.best.cta) {
                content += `\n\n${result.best.cta}`;
              }
              priorCaptions.push(result.best.caption);
            } else {
              content = `${params.prompt} - Post ${postIndex + 1}`;
              hashtags = ['#business', '#growth'];
            }
          } catch (err) {
            console.error('Quality generation failed:', err);
            content = `${params.prompt} - Post ${postIndex + 1}`;
            hashtags = ['#business', '#growth'];
          }
          
          if (hashtags.length > 0) {
            content += '\n\n' + hashtags.join(' ');
          }
          
          // Update progress
          global.campaignProgress[progressKey].current = postIndex;
          global.campaignProgress[progressKey].status = `Generating image ${postIndex + 1} of 14...`;
          
          // Add delay between images
          if (postIndex > 0) {
            await delay(3000);
          }
          
          // Generate image
          let imageUrl: string | undefined;
          try {
            const imagePrompt = `Professional social media image for ${params.businessName || 'business'}: ${content.substring(0, 80)}. Style: modern, clean, engaging.`;
            const imageResult = await generateImage({
              prompt: imagePrompt,
              aspectRatio: platform === 'instagram' ? '1:1' : '16:9',
              model: 'auto'
            });
            imageUrl = imageResult.url;
            
            if (userId && imageUrl) {
              await saveToLibrary({
                userId,
                type: 'image',
                url: imageUrl,
                meta: {
                  prompt: imagePrompt,
                  caption: content,
                  platform,
                  campaignId,
                  postType,
                  aspectRatio: imageResult.aspectRatio
                }
              });
            }
          } catch (imageError) {
            console.error('Image generation failed:', imageError);
          }
          
          const post = await storage.createPost({
            userId,
            campaignId,
            content,
            platform,
            status: 'draft',
            scheduledFor: scheduledDate,
            aiGenerated: true,
            imageUrl,
            metadata: {
              day: day + 1,
              slot: slot + 1,
              campaignPost: true,
              postType,
              qualityGenerated: true,
              hasImage: !!imageUrl
            },
          });
          
          posts.push(post);
          global.campaignProgress[progressKey].posts.push(post);
          global.campaignProgress[progressKey].current = postIndex + 1;
          global.campaignProgress[progressKey].status = `Created post ${postIndex + 1} of 14`;
          
          postIndex++;
        }
      }
      
      // Update campaign as complete
      await storage.updateCampaign(campaignId, {
        generationProgress: 100,
        status: 'review',
      });
      
      global.campaignProgress[progressKey].status = 'Complete';
      
      // Keep progress for 5 minutes after completion
      setTimeout(() => {
        delete global.campaignProgress[progressKey];
      }, 5 * 60 * 1000);
      
    } catch (error) {
      console.error('Background generation error:', error);
      global.campaignProgress[progressKey].status = 'Failed';
      await storage.updateCampaign(campaignId, {
        status: 'failed',
      });
    }
  }
  
  // POST /api/campaigns/generate - Start campaign generation
  router.post('/api/campaigns/generate', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const params = generateCampaignSchema.parse(req.body);
      
      // Check if user has enough credits for campaign generation
      // 14 posts × (5 credits for image + 1 credit for text) = 84 credits total
      const CAMPAIGN_CREDIT_COST = 84;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      // Check if user has sufficient credits
      if (false) {
        return res.status(402).json({ 
          error: 'Insufficient credits for campaign generation',
          message: `Campaign generation requires ${CAMPAIGN_CREDIT_COST} credits (14 posts with images). You have ${user.credits ?? 0} credits.`,
          required: CAMPAIGN_CREDIT_COST,
          have: user.credits ?? 0
        });
      }
      
      // Deduct credits upfront for the entire campaign (disabled)
      if (false) {
        await storage.updateUser(userId, {
          credits: user.credits ?? 0,
          totalCreditsUsed: user.totalCreditsUsed ?? 0
        });
      }
      
      // Get brand profile for better content generation
      let brandProfile = await storage.getBrandProfile(userId);
      
      // If no brand profile exists, create a basic one from campaign params
      if (!brandProfile) {
        brandProfile = {
          id: 'temp',
          userId,
          brandName: params.businessName || 'Business',
          voice: (params.brandTone as any) || 'friendly',
          targetAudience: params.targetAudience || 'General audience',
          products: params.productName ? [params.productName] : [],
          valueProps: [],
          bannedPhrases: [],
          requiredDisclaimers: [],
          preferredCTAs: params.callToAction ? [params.callToAction] : ['Learn More'],
          keywords: params.keyMessages || [],
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      
      // Create the campaign
      const campaign = await storage.createCampaign({
        userId,
        name: `Campaign: ${params.prompt}`,
        description: `Auto-generated campaign for: ${params.prompt}`,
        platform: 'multi',
        businessName: params.businessName || 'Business',
        productName: params.productName || '',
        targetAudience: params.targetAudience || 'General audience',
        campaignGoals: 'Engagement and brand awareness',
        brandTone: params.brandTone || 'professional',
        keyMessages: params.keyMessages || [],
        platform: 'instagram',
        visualStyle: 'modern',
        colorScheme: 'brand colors',
        callToAction: params.callToAction || 'Learn more',
        status: 'draft',
        startDate: new Date(params.start_date),
        endDate: new Date(new Date(params.start_date).getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days later
        postsPerDay: 2,
        totalPosts: 14,
        generationProgress: 0,
      });

      // Initialize progress tracking
      const progressKey = `campaign_progress_${campaign.id}`;
      if (!global.campaignProgress) {
        global.campaignProgress = {};
      }
      global.campaignProgress[progressKey] = {
        total: 14,
        current: 0,
        status: 'Starting generation...',
        posts: [],
        userId, // Store userId for ownership check
      };
      
      // Start generation in the background (non-blocking)
      setImmediate(async () => {
        await generateCampaignPostsAsync(
          campaign.id,
          userId,
          params,
          brandProfile,
          storage
        );
      });
      
      // Return immediately with campaign ID for polling
      res.json({
        campaignId: campaign.id,
        message: 'Campaign generation started. Poll /api/campaigns/:id/progress for updates.',
        campaign,
      });
    } catch (error) {
      console.error('Generate campaign error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to generate campaign' });
    }
  });

  // PUT /api/campaigns/:id/apply-schedule - Adjust post schedules
  router.put('/api/campaigns/:id/apply-schedule', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const schedule = applyCampaignScheduleSchema.parse(req.body);
      
      // Get the campaign
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      // Verify ownership
      const user = await storage.getUser(userId);
      if (campaign.userId !== userId && user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      // Get all posts for this campaign
      const posts = await storage.getPostsByCampaignId(id);
      
      // Parse time slots
      const [morningHour, morningMinute] = schedule.morningSlot.split(':').map(Number);
      const [afternoonHour, afternoonMinute] = schedule.afternoonSlot.split(':').map(Number);
      
      // Check for overlaps with existing scheduled posts
      const updatedPosts = [];
      for (const post of posts) {
        if (post.scheduledFor) {
          const scheduledDate = new Date(post.scheduledFor);
          const metadata = post.metadata as any;
          
          if (metadata?.slot === 1) {
            // Morning slot
            scheduledDate.setHours(morningHour, morningMinute, 0, 0);
          } else if (metadata?.slot === 2) {
            // Afternoon slot
            scheduledDate.setHours(afternoonHour, afternoonMinute, 0, 0);
          }
          
          // Check for conflicts with other scheduled posts
          const conflictingPost = await storage.getScheduledPostAtTime(userId, scheduledDate);
          if (conflictingPost && conflictingPost.id !== post.id) {
            return res.status(422).json({ 
              error: 'Schedule conflict', 
              message: `Post at ${scheduledDate.toISOString()} conflicts with existing scheduled post` 
            });
          }
          
          // Update the post schedule
          await storage.updatePost(post.id, {
            scheduledFor: scheduledDate,
          });
          
          updatedPosts.push({ ...post, scheduledFor: scheduledDate });
        }
      }
      
      res.json({
        campaignId: id,
        updatedCount: updatedPosts.length,
        posts: updatedPosts,
      });
    } catch (error) {
      console.error('Apply schedule error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to apply schedule' });
    }
  });

  // GET /api/campaigns/:id/posts - Get all posts for a campaign
  router.get('/api/campaigns/:id/posts', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      
      // Get the campaign to verify access
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      // Verify access
      const user = await storage.getUser(userId);
      if (campaign.userId !== userId && user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      // Get all posts for this campaign
      const posts = await storage.getPostsByCampaignId(id);
      
      // Sort by scheduled date
      posts.sort((a, b) => {
        if (!a.scheduledFor || !b.scheduledFor) return 0;
        return new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();
      });
      
      res.json(posts);
    } catch (error) {
      console.error('Get campaign posts error:', error);
      res.status(500).json({ error: 'Failed to fetch campaign posts' });
    }
  });

  // GET /api/campaigns/:id/progress - Get campaign generation progress
  router.get('/api/campaigns/:id/progress', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const { id } = req.params;
      const progressKey = `campaign_progress_${id}`;
      
      // Check if progress exists and verify ownership
      if (global.campaignProgress?.[progressKey]) {
        const progress = global.campaignProgress[progressKey];
        
        // Security: Verify user owns this campaign progress
        const user = await storage.getUser(userId);
        if (progress.userId !== userId && user?.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        
        // Don't send userId in response
        const { userId: _, ...safeProgress } = progress;
        res.json(safeProgress);
      } else {
        // Check if campaign exists and is complete
        const campaign = await storage.getCampaign(id);
        if (campaign && campaign.generationProgress === 100) {
          res.json({
            total: 14,
            current: 14,
            status: 'Complete',
            posts: []
          });
        } else {
          res.json({
            total: 14,
            current: 0,
            status: 'Not started',
            posts: []
          });
        }
      }
    } catch (error) {
      console.error('Get progress error:', error);
      res.status(500).json({ error: 'Failed to get progress' });
    }
  });
  
  return router;
}
