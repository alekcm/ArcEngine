
if ( SERVER ) then
    
	AddCSLuaFile ()

end

if CLIENT then
    
    killicon.Add("bloodmanipulation", "bloodmanipulation/chibi", Color(255, 255, 255))
    SWEP.WepSelectIcon = surface.GetTextureID( "bloodmanipulation/flowingred" )
end

SWEP.PrintName = "Blood Manipulation"
SWEP.Author = "minwool"
SWEP.Instructions = "yuji's biggest brother"

SWEP.Category  = "DDF Kaisen"
SWEP.Spawnable = true
SWEP.AdminOnly = false

SWEP.HoldType = "normal"
SWEP.UseHands = true

SWEP.ViewModel = ''
SWEP.WorldModel = 'models/bloodmanipulation/bm_blood_edge.mdl'

SWEP.Primary.ClipSize = -1
SWEP.Primary.DefaultClip = -1
SWEP.Primary.Automatic = false
SWEP.Primary.Ammo = "none"

SWEP.Secondary.ClipSize = -1
SWEP.Secondary.DefaultClip = -1
SWEP.Secondary.Automatic = false
SWEP.Secondary.Ammo = "none"

SWEP.defaultHoldType = "Normal"

SWEP.maxHP = 10000

-- normals
SWEP.barrage = false
SWEP.lunge = false
SWEP.dj = false

-- Blood Manipulation

-- piercing blood
SWEP.piercing_display = false

SWEP.piercing    = false
SWEP.piercing_cd = false
SWEP.blood_slice = false
SWEP.piercing_active = false
SWEP.piercing_projectile = false

SWEP.blood_bar = 30

SWEP.flowing_red = 0
SWEP.red_scale = false
SWEP.wingking = false

SWEP.spikes = false
SWEP.single_chakram = false
SWEP.supernova = false
SWEP.bind = false
SWEP.meteorshower = false


hook.Add("PlayerSpawn", "bm_InitializePlayerVariable", function(ply)
    if IsValid(ply) then

        ply:SetNWBool("bm_equipped", false)
        ply:SetNWBool("bm_shift", false) 
        ply:SetNWBool("bm_zone", false) 
        ply:SetNWBool("bm_debounce", false)
        ply:SetNWBool("bm_blood_bar", false)
        ply:SetNWInt("bm_mode", 0) -- 0: phys, 1: blood
        ply:SetNWInt("bm_zone_meter", 120)
        ply:SetNWInt("bm_pity", 600)
    end
end)

function SWEP:Initialize()
 
    local ply = self:GetOwner()

    if IsValid(ply) then
    
        local vm = self.Owner:GetViewModel()

        if IsValid(vm) then
            vm:DrawShadow(false)
        end

        if SERVER then
            self.equipped = false
            self:SetHoldType(self.defaultHoldType)

            
        end
       
    end
end

if CLIENT then

    net.Receive("UpdateBloodBar", function()
        local updated = net.ReadInt(32)
        LocalPlayer().blood_bar = updated 
    end)

    net.Receive("UpdateFlowingRed", function()
        local updated = net.ReadInt(32)
        LocalPlayer().flowing_red = updated 
    end)

    net.Receive("UpdateWingKing", function()
        local updated = net.ReadBool()
        LocalPlayer().wingking = updated
       
    end)

    function SWEP:DrawHUD()

        local ply = LocalPlayer()
    
        local mode 
        local color
    
        if ply:GetNWInt("bm_mode") == 1 then
            mode = "Blood Edge"
            color = Color(191,0,38)
        else
            mode = "Fists"
            color = Color(95,0,28)
    
        end
    
        draw.SimpleText("Cursed Technique: Blood Manipulation", "GModNotify", 60, 130, Color(150,0,0), TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
        draw.SimpleText("[ALT] - Melee: ".. mode, "GModNotify", 60, 160, color, TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
    
        local health = ply:Health()
        local maxHealth = self.maxHP
    
        local barWidth = 500
        local barHeight = 20
        local barX = 60
        local barY = ScrH() - 830
        local healthPercentage = health / maxHealth
    
        local text = "Health: " .. health .. " / " .. maxHealth
    
        surface.SetFont("ScoreboardDefault")
        local textWidth, textHeight = surface.GetTextSize(text)
        surface.SetDrawColor(72, 0, 13, 110)
        surface.DrawRect(barX, barY, barWidth, barHeight)
        surface.SetDrawColor(Color(176,0,23))
        surface.DrawRect(barX, barY, barWidth * healthPercentage, barHeight)
    
        surface.SetTextColor(Color(255, 255, 255))
        surface.SetTextPos(barX + 10 / 2, barY - textHeight + 21)
        surface.DrawText(text)

        local blood_bar = LocalPlayer().blood_bar or 0
        local flowing_red = LocalPlayer().flowing_red or 0

        if blood_bar < 30 then

            local max = 30
            local barWidth = 70
            local barHeight = 5
            local barX = (ScrW() / 2) - (barWidth / 2)
            local barY = (ScrH() / 2) - (barHeight / 2) + 30
        
            local cePercent = blood_bar / max
        
            surface.SetDrawColor(60, 0, 0, 150)
            surface.DrawRect(barX, barY, barWidth, barHeight)
            surface.SetDrawColor(227, 0, 38)
            surface.DrawRect(barX, barY, barWidth * cePercent, barHeight)
        end

        
        local max = 100

        local barWidth = 500
        local barHeight = 20
        local barX = 60
        local barY = ScrH() - 810
        local healthPercentage = flowing_red / max
    
        local text = "Flowing Red Scale"

        if ply:GetNWBool("bm_zone") then
            text = "Flowing Red Scale: Stack"
        end

        if LocalPlayer().wingking then
            text = text.. " & Wing King"
        end
    
        surface.SetFont("ScoreboardDefault")
        local textWidth, textHeight = surface.GetTextSize(text)
        surface.SetDrawColor(99, 0, 18, 194)
        surface.DrawRect(barX, barY, barWidth, barHeight)
        surface.SetDrawColor(Color(252,0,34))
        surface.DrawRect(barX, barY, barWidth * healthPercentage, barHeight)
        
        if flowing_red >= 25 then
            surface.SetTextColor(Color(255, 255, 255))

        else
            surface.SetTextColor(Color(0, 0, 0, 180))
        end

        surface.SetTextPos(barX + 10 / 2, barY - textHeight + 21)
        surface.DrawText(text)

        if ply:GetNWBool("bm_zone") then-- zone meter
    
            local max_zone = 120
        
            local barWidth = 500
            local barHeight = 15
            local barX = 60
            local barY = ScrH() - 790
    
            local cePercent = ply:GetNWInt("bm_zone_meter")  / max_zone
        
            local text = "ZONE AMP"
        
            surface.SetFont("CenterPrintText")
            local textWidth, textHeight = surface.GetTextSize(text)
            surface.SetDrawColor(255, 0, 0, 75)
            surface.DrawRect(barX, barY, barWidth, barHeight)
            surface.SetDrawColor(0, 0, 0)
            surface.DrawRect(barX, barY, barWidth * cePercent, barHeight)
        
            surface.SetTextColor(Color(255, 0, 0))
            surface.SetTextPos(barX + 10 / 2, barY - textHeight + 17)
            surface.DrawText(text)

        end
        
    end

    local wingking 

	local WorldModel = ClientsideModel(SWEP.WorldModel)
    local wingking = ClientsideModel('models/bloodmanipulation/bm_wingking.mdl')

	WorldModel:SetNoDraw(true)
    WorldModel:DrawShadow(false)

	wingking:SetNoDraw(true)
    wingking:DrawShadow(false)

	function SWEP:DrawWorldModel()

		local ply = self:GetOwner()
       
		if (IsValid(ply)) then
        
            local wk_offsetVec
            local wk_boneid
            local wk_offsetAng

            if LocalPlayer().wingking then
               
                wingking:SetMaterial('bloodmanipulation/effects/bloodystream')
                wingking:SetModelScale(0.3)
                wingking:SetRenderMode(RENDERMODE_TRANSALPHA)
                wingking:Activate()
                wingking:SetupBones()
                wk_offsetVec = Vector(10, -20, 0)
                wk_offsetAng = Angle(90, 20, 0)
               
            else
                wingking:SetRenderMode(RENDERMODE_TRANSALPHA)
                wingking:SetColor(Color(0,0,0,0))

                wk_offsetVec = Vector(0, 0, 0)
                wk_offsetAng = Angle(0, 0, 0)
            end

           
            wk_boneid = ply:LookupBone("ValveBiped.Bip01_Spine")

            if !wk_boneid then return end

            local matrix = ply:GetBoneMatrix(wk_boneid)
            if !matrix then return end

            local newPos, newAng = LocalToWorld(wk_offsetVec, wk_offsetAng, matrix:GetTranslation(), matrix:GetAngles())
           
            wingking:SetPos(newPos)
            wingking:SetAngles(newAng)

            local offsetVec
            local boneid
            local offsetAng

            if ply:GetNWBool("bm_mode") == 1 then

                boneid = ply:LookupBone("ValveBiped.Bip01_R_Hand") -- right hand

                WorldModel:SetModel('models/bloodmanipulation/bm_blood_edge.mdl')
                WorldModel:SetMaterial('bloodmanipulation/effects/bloodystream')
                WorldModel:SetModelScale(0.3)
                offsetVec = Vector(2, -1, 0)
                WorldModel:SetupBones()
                offsetAng = Angle(180, 0, 0)
            else
                boneid = ply:LookupBone("ValveBiped.Bip01_R_Hand") -- right hand

                WorldModel:SetModelScale(0.01)
                WorldModel:SetRenderMode(RENDERMODE_TRANSALPHA)
                WorldModel:SetColor(Color(0,0,0,0))
                offsetAng = Angle(180, 0, 0)

                offsetVec = Vector(0, 0, 0)
                WorldModel:SetupBones()
            end
            
			if !boneid then return end

			local matrix = ply:GetBoneMatrix(boneid)
			if !matrix then return end

			local newPos, newAng = LocalToWorld(offsetVec, offsetAng, matrix:GetTranslation(), matrix:GetAngles())
           
			WorldModel:SetPos(newPos)
			WorldModel:SetAngles(newAng)

           
		else
			WorldModel:SetPos(self:GetPos())
			WorldModel:SetAngles(self:GetAngles())
            wingking:SetPos(self:GetPos())
			wingking:SetAngles(self:GetAngles())
		end

		WorldModel:DrawModel()

        if LocalPlayer().wingking then
            wingking:DrawModel()
        end
       
	end
end

function SWEP:Melee(ply)

    if (self.barrage or !IsValid(ply)) then return end
    self.barrage = true

    local range = 400
    local damage = 50
    local cooldown = 3
    local hit = "minwool/jjk/hit.wav"
    local effect = "jjk_normal"

    if ply:GetNWBool("bm_zone") then
        damage = damage*1.5
    end
    
    if self.red_scale then
        damage = damage*1.2
    end

    timer.Simple(cooldown, function() self.barrage = false end)

    self:SetHoldType("fist")
    timer.Simple(2, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

    ply:SetAnimation(PLAYER_ATTACK1)

  
    timer.Create("vs_barrage_think", 0.1, 5, function()
        self:SetHoldType('fist')
        ply:SetAnimation(PLAYER_ATTACK1)
        ply:EmitSound("minwool/jjk/swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            maxs = {45,45,45},
            mins = {-45,-45,-45}
        })

        local entities = ents.FindInSphere(trace.HitPos, range)
        local lentities  = {} 
    
        for _, ent in ipairs(entities) do
            if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                table.insert(lentities, ent)
            end
        end
    
        for _, ent in ipairs(lentities) do
            if ( !IsValid(ent) or !SERVER ) then return end 
            ParticleEffect( effect, (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
            ent:EmitSound(hit, 340, math.random(100,110), 1, CHAN_STATIC)
            ent:TakeDamage(damage, ply, self)
            util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)

            if math.random(1, ply:GetNWInt("bm_pity")) == 1 then -- black flash
                self:BlackFlash(ply, damage, lentities, trace)
                return
            end

            self.flowing_red = self.flowing_red + 0.5

        end
    end)

    timer.Simple(0.7, function()
        ply:EmitSound("minwool/jjk/heavy_swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

        self:SetHoldType("melee")
        timer.Simple(0.3, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)
  
        ply:SetAnimation(PLAYER_ATTACK1)

        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            maxs = {45,45,45},
            mins = {-45,-45,-45}
        })

        local entities = ents.FindInSphere(trace.HitPos, range)
        local lentities  = {} 
    
        for _, ent in ipairs(entities) do
            if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                table.insert(lentities, ent)
            end
        end

        for _, ent in ipairs(lentities) do
            if ( !IsValid(ent) or !SERVER ) then return end 
            ParticleEffect( effect, (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
            ent:EmitSound("minwool/jjk/heavy_hit.wav", 340, math.random(100,110), 1, CHAN_STATIC)
            ent:TakeDamage(damage*2, ply, self)
            util.ScreenShake(ply:GetPos(), 100, 40, 1, 600, true)

            if math.random(1, ply:GetNWInt("bm_pity")) == 1 then -- black flash
                self:BlackFlash(ply, damage*2, lentities, trace)
                return
            end

            local phys = ent:GetPhysicsObject()

            local dir = (trace.HitPos - ply:GetPos()):GetNormalized()
            local force = 1500

            if IsValid(phys) then 
                phys:SetVelocity(dir * force) 

            end

            self.flowing_red = self.flowing_red + 1
            ent:SetVelocity(dir * force) 

        end
    end)
end

function SWEP:Lunge(ply)
    if !IsValid(ply) or self.lunge then return end
    self.lunge = true 

    local intensity = 1500

    if self.wingking then
        intensity = 1700
    end
    ply:EmitSound("bloodmanipulation/double_jump_blood.wav", 350, math.random(80,120), 0.2, CHAN_STATIC)

    ply:EmitSound("minwool/jjk/double_jump.wav", 350, math.random(80,120), 1, CHAN_STATIC)
    ply:SetVelocity( (ply:GetAimVector() * intensity))

    local RFoot = ply:LookupBone("ValveBiped.Bip01_R_Foot")
    local LFoot = ply:LookupBone("ValveBiped.Bip01_L_Foot")

    if !RFoot or !LFoot then return end
    local RPos = ply:GetBonePosition(RFoot)
    local LPos = ply:GetBonePosition(LFoot)

    ParticleEffect("bm_blood_bounce", RPos, Angle(0,0,0), self)
    ParticleEffect("bm_blood_bounce", LPos, Angle(0,0,0), self)


end

function SWEP:Convergence(ply, condition)
    if self.piercing_cd then return end
    self.piercing_cd = true

    local damage = 50
    local ball_range = 50
    local cooldown = 5
    -- wind up
  
    ply:EmitSound("bloodmanipulation/piercing_blood_initial.wav", 450, 100, 1, CHAN_AUTO, SND_SHOULDPAUSE)
    self:SetHoldType("revolver")

    if SERVER then
        self.blood_glare = ents.Create("env_sprite")

        if IsValid(self.blood_glare) then

            self.blood_glare:SetKeyValue("rendercolor", "255, 0, 50")
            self.blood_glare:SetKeyValue("HDRColorScale", "1")
            self.blood_glare:SetKeyValue("rendermode", "9")
            self.blood_glare:SetKeyValue("model", "bloodmanipulation/effects/blood_glare.vmt")
            self.blood_glare:SetKeyValue("scale", "0.7")
            self.blood_glare:Spawn()
            ply.blood_glare = self.blood_glare
            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + ( (ply:GetAimVector()+ Vector(0,0,-0.3)) * ball_range ),
                filter = ply
            })
            self.blood_glare:SetPos(trace.HitPos)
            timer.Create("blood_glare", 0, 50, function()
                if !ply:Alive() then
                    if IsValid(ply.blood_glare) then
                        ply.blood_glare:Remove()

                    end
                end
                if !IsValid(self.blood_glare) then return end

                local trace = util.TraceLine({
                    start = ply:GetShootPos(),
                    endpos = ply:GetShootPos() + ( (ply:GetAimVector()+ Vector(0,0,-0.3)) * ball_range ),
                    filter = ply
                })
                
                self.blood_glare:SetPos(trace.HitPos)

            end)
        end
    end 
    
    timer.Simple(0.5, function()

        if IsValid(self.blood_glare) then
            self.blood_glare:Remove()

        end

        self:SetHoldType("revolver")
        if SERVER then
            self.blood_ball = ents.Create("prop_dynamic")
            self.blood_ball_glow = ents.Create("env_sprite")
            self.pblood_light = ents.Create("light_dynamic")
            self.blood_piercer = ents.Create("prop_dynamic")
    
            if IsValid(self.blood_ball) and IsValid(self.blood_piercer) then
                
                self.blood_ball:SetModel("models/xqm/rails/gumball_1.mdl")
                self.blood_ball:SetMaterial("minwool/jjk/solid_glow")
                self.blood_ball:SetColor(Color(153, 16, 44, 241))
                self.blood_ball:SetRenderMode( RENDERMODE_TRANSALPHA )
                self.blood_ball:SetModelScale(0.2, 0.1)
                self.blood_ball:SetMoveType( MOVETYPE_NOCLIP )
                self.blood_ball:DrawShadow(false)
    
                self.blood_ball_glow:SetKeyValue("rendercolor", "200, 0, 50")
                self.blood_ball_glow:SetKeyValue("HDRColorScale", "1")
                self.blood_ball_glow:SetKeyValue("rendermode", "5")
                self.blood_ball_glow:SetKeyValue("model", "bloodmanipulation/effects/blood_end.vmt")
                self.blood_ball_glow:SetKeyValue("scale", "0.1")
    
                self.blood_piercer:SetModel("models/bloodmanipulation/piercer.mdl")
                self.blood_piercer:SetMaterial("bloodmanipulation/effects/bloodystream")
                self.blood_piercer:SetColor(Color(146, 146, 146, 244))
                self.blood_piercer:SetRenderMode( RENDERMODE_TRANSALPHA )
                self.blood_piercer:SetModelScale(0.1)
                self.blood_piercer:SetMoveType( MOVETYPE_NOCLIP )
                self.blood_piercer:DrawShadow(false)
    
                self.pblood_light:SetKeyValue("brightness", "3")
                self.pblood_light:SetKeyValue("distance", "200")
                self.pblood_light:SetKeyValue("_light", "255, 0, 0")
    
                self.blood_ball:Spawn()
                self.blood_piercer:Spawn()
                self.pblood_light:Spawn()
                self.blood_ball_glow:Spawn()
    
                self.pblood_light:SetParent(self.blood_piercer)
                self.pblood_light:SetLocalPos(Vector(0,0,0))
    
                self.blood_ball_glow:SetParent(self.blood_ball)
                self.blood_ball_glow:SetLocalPos(Vector(0,0,0))
    
                ply.blood_ball = self.blood_ball
                ply.blood_piercer = self.blood_piercer
    
                self.blood_ball:SetPos(ply:GetAimVector()*ball_range)
                self.blood_piercer:SetPos(ply:GetAimVector()*ball_range)
    
                local range = ball_range            
                
                local rope = constraint.Rope(self.blood_ball, self.blood_piercer, 0, 0, Vector(0, 0, 0), Vector(0, 0, 0), 100, 1000, 0, 4, "bloodmanipulation/effects/bloodystream", Color(255,255,255))
                util.ScreenShake(ply:GetPos(), 100, 30, 5, 2500, true)

                timer.Create("piercing_blood_debris", 0, 0, function()

                    if !IsValid(ply.blood_ball) or !IsValid(ply.blood_piercer) then return end
                    
                    if !ply:Alive() then
                    
                        ply.blood_ball:Remove()
                    
                        ply.blood_piercer:Remove()
                    
                    end

                end)
                timer.Create("piercing_blood_windup", 0, 10, function()
                    if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) or self.piercing_projectile then return end
                    
                    if !ply:Alive() then
                        if IsValid(ply.blood_ball) then
                            ply.blood_ball:Remove()
                        end
                        if IsValid(ply.blood_piercer) then
                            ply.blood_piercer:Remove()
                        end
                        return
                    end
                  
                    range = range + 20

                    if IsValid(rope) then
                        rope:Remove()

                    end

                    local ball_trace = util.TraceLine({
                        start = ply:GetShootPos(),
                        endpos = ply:GetShootPos() + ( (ply:GetAimVector() + Vector(0,0,-0.3)) * ball_range ),
                        filter = ply
                    })
    
                    local trace = util.TraceLine({
                        start = ply:GetShootPos(),
                        endpos = ply:GetShootPos() + ( ply:GetAimVector() * range ),
                        filter = ply
                    })
    
                    self.blood_ball:SetPos(ball_trace.HitPos)
                    self.blood_piercer:SetPos(trace.HitPos)
                    self.blood_piercer:SetAngles(ply:EyeAngles())

                end)
                timer.Create("piercing_blood_particle_think", 0.05, 2000, function()
                    if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end
                    ParticleEffect("bm_piercing_blood_spew", self.blood_ball:GetPos(), ply:EyeAngles() + Angle(0,90,0), self)
                    ParticleEffect( "bm_blood_hit", self.blood_piercer:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), self )
                    self:SetHoldType("revolver")
                end)

                timer.Create("looping_sound", 0, 2000, function()
                    if IsValid(self.blood_ball) then
                        self.blood_ball:StartLoopingSound("bloodmanipulation/piercing_blood_loop.wav")
                    end
                
                end)
                timer.Simple(0.1, function()
                    self.piercing_active = true

                end)

                timer.Simple(0.2, function()
                 

                    if !self.piercing then
                        if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end

                        self.piercing_active = false
                        self.piercing_projectile = true

                        local hit = false
                        self.blood_piercer:EmitSound("bloodmanipulation/piercing_blood_end.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)
                        self.blood_ball:SetModelScale(0.01, 1)

                        if IsValid(self.blood_ball_glow) then
                            self.blood_ball_glow:Remove()
                        end

                        local trace = util.TraceLine({
                            start = ply:GetShootPos(),
                            endpos = ply:GetShootPos() + ( ply:GetAimVector() * 10 ),
                            filter = ply
                        })

                        local trace2 = util.TraceLine({
                            start = ply:GetShootPos(),
                            endpos = ply:GetShootPos() + ( ply:GetAimVector() * 300 ),
                            filter = ply
                        })

                        local trace3 = util.TraceLine({
                            start = ply:GetShootPos(),
                            endpos = ply:GetShootPos() + ( ply:GetAimVector() * 50000 ),
                            filter = ply
                        })

                        self.blood_ball:SetPos(trace.HitPos)
                        self.blood_piercer:SetPos(trace2.HitPos)
                        local detector = trace3.HitPos

                        local dir = (trace.HitPos - ply:EyePos()):GetNormalized()
                        local speed = 6000
                        local movement = dir * speed
                        local movementTime = 0.01
                        local damage = 425

                        timer.Simple(1, function()
                            self.defaultHoldType = "Normal"
                            self:SetHoldType(self.defaultHoldType)
                        end)

                        local function explode()
                            if !IsValid(self.blood_piercer) or hit then return end 
                            hit = true
                            ParticleEffect( "bm_blood_explode", self.blood_piercer:GetPos(), Angle(0,0,0), ent )
        
                            util.ScreenShake(self.blood_piercer:GetPos(), 500, 40, 5, 4000, true)
                            self.blood_piercer:EmitSound("bloodmanipulation/piercing_end.wav", 400, 100, 1, CHAN_AUTO, SND_SHOULDPAUSE)

                            local entities = ents.FindInSphere(self.blood_piercer:GetPos(), 500)
                
                            for _, ent in ipairs(entities) do
            
                                if ent:IsValid() and ( ent ~= ply ) and !ent:GetNWBool("barrier") then
                                    if SERVER then
            
                                        local dir = (ent:GetPos() - self.blood_piercer:GetPos()):GetNormalized()
                                        local force = 1000
                    
                                        local phys = ent:GetPhysicsObject()
                                        
                                        if IsValid(phys) then
                                            phys:EnableMotion(true)
                                            constraint.RemoveAll(ent)
            
                                            phys:SetVelocity(dir * force)
                                        end
            
                                        ent:SetVelocity((dir * force))
                                        ent:TakeDamage(damage, ply, self)

                                        if self.wingking then
                                            self:Poison(ply, ent, 0.5, 5, 100)
                                        end

                                        self.flowing_red = self.flowing_red + 2

                                    end
                                end
                            end
            
                            if IsValid(self.blood_piercer) then
                                self.blood_piercer:Remove()
                                
                            end
                            
                            if IsValid(self.blood_ball) then
                        
                                self.blood_ball:StopLoopingSound(1)
                                self.blood_ball:Remove()
                            end
                            
                        end

                        print(detector)

                        timer.Create("piercing_blood_particle", 0.05, 250, function()
                            if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end
                            ParticleEffect("bm_blood_spew", self.blood_piercer:GetPos(), self.blood_piercer:GetAngles() + Angle(0,90,0), self)
                            ParticleEffect("bm_piercing_blood_spew", self.blood_piercer:GetPos(), self.blood_piercer:GetAngles() + Angle(0,90,0), self)
                            ParticleEffect( "bm_blood_hit", self.blood_piercer:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), self )

                        end)

                        timer.Create("piercing_blood_projectile", 0, 500, function()
                            if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end
                            
                            if !ply:Alive() then
                                if IsValid(ply.blood_ball) then
                                    ply.blood_ball:Remove()
                                end
                                if IsValid(ply.blood_piercer) then
                                    ply.blood_piercer:Remove()
                                end
                                return
                            end
    
                            local newPos2 = self.blood_ball:GetPos() + movement * movementTime
                            self.blood_ball:SetPos(newPos2)
    
                            local newPos = self.blood_piercer:GetPos() + movement * movementTime
                            self.blood_piercer:SetPos(newPos)
            
                            local entities = ents.FindInSphere(detector, 100)
        
                            for _, ent in ipairs(entities) do
        
                                if ( ent:IsValid() and ent == self.blood_piercer) then
                                    if SERVER then
                                        explode()
                                    end
                                end
                            end
        
                            local entities = ents.FindInSphere(self.blood_piercer:GetPos(), 100)
                
                            for _, ent in ipairs(entities) do
        
                                if ( ent:IsValid() and ent ~= ply and ent:IsSolid() ) and !( ent:GetNWBool("barrier") ) then
                                    if SERVER then
                                        explode()
                                    end
                                end
                            end

                        end)

                        
                        
                    else
                        if IsValid(self.blood_piercer) then
                            self.blood_piercer:SetModelScale(0.001, 1)
                        end
                    end
                   

                end)
         

                timer.Simple(cooldown, function()

                    if self.piercing_projectile then
                        if IsValid(self.blood_ball) then
                
                            self.blood_ball:StopLoopingSound(0)
                            self.blood_ball:Remove()
                        end
                        
                        if IsValid(self.blood_piercer) then
                            self.blood_piercer:Remove()
                        end
                        self.piercing_projectile = false

                        self.piercing_cd = false
                        self.piercing_active = false
                    
                        self:SetHoldType("Normal")
                    end
                end)

            end
        end
    end)
end

function SWEP:BloodSpikes(ply, condition)   
    
    if self.spikes then return end
    self.spikes = true

    local cooldown = 3
    local range = 10000
    local damage = 50

    if ply:GetNWBool("bm_zone") then
        damage = damage*1.5
    end

    if self.red_scale then
        damage = damage*1.2
    end

    local trace = util.TraceLine({
        start = ply:GetShootPos(),
        endpos = ply:GetShootPos() + ( ply:GetAimVector() * range ),
        filter = ply
    })

    if !trace.HitSky then
           
        if SERVER then
            self.blood_spikes  = ents.Create("prop_dynamic")
            self.blood_spikes2 = ents.Create("prop_dynamic")
            self.blood_spikes3 = ents.Create("prop_dynamic")
            self.spikes_light  = ents.Create("light_dynamic")

            if !IsValid(self.blood_spikes) then return end
            self.blood_spikes:SetModel("models/bloodmanipulation/blood_spikes.mdl")
            self.blood_spikes:SetMaterial("bloodmanipulation/models/blood_spikes")
            self.blood_spikes:SetColor(Color(155, 51, 51, 250))
            self.blood_spikes:SetRenderMode( RENDERMODE_TRANSALPHA )
            self.blood_spikes:SetModelScale(2, 0.3)
            self.blood_spikes:SetMoveType( MOVETYPE_NOCLIP )
            self.blood_spikes:DrawShadow(false)
            self.blood_spikes:Spawn()

            self.blood_spikes2:SetModel("models/bloodmanipulation/blood_spikes.mdl")
            self.blood_spikes2:SetMaterial("bloodmanipulation/models/blood_spikes")
            self.blood_spikes2:SetColor(Color(155, 51, 51, 250))
            self.blood_spikes2:SetRenderMode( RENDERMODE_TRANSALPHA )
            self.blood_spikes2:SetModelScale(2, 0.4)
            self.blood_spikes2:SetMoveType( MOVETYPE_NOCLIP )
            self.blood_spikes2:DrawShadow(false)
            self.blood_spikes2:Spawn()

            self.blood_spikes3:SetModel("models/bloodmanipulation/blood_spikes.mdl")
            self.blood_spikes3:SetMaterial("bloodmanipulation/models/blood_spikes")
            self.blood_spikes3:SetColor(Color(155, 51, 51, 250))
            self.blood_spikes3:SetRenderMode( RENDERMODE_TRANSALPHA )
            self.blood_spikes3:SetModelScale(2, 0.3)
            self.blood_spikes3:SetMoveType( MOVETYPE_NOCLIP )
            self.blood_spikes3:DrawShadow(false)
            self.blood_spikes3:Spawn()

            self.spikes_light:SetKeyValue("brightness", "1")
            self.spikes_light:SetKeyValue("distance", "1000")
            self.spikes_light:SetKeyValue("_light", "255, 0, 20")

            self.spikes_light:SetParent(self.blood_spikes)
            self.spikes_light:SetLocalPos(Vector(0,0,0))
            self.spikes_light:Spawn()

            ply.blood_spikes = self.blood_spikes
            ply.blood_spikes2 = self.blood_spikes2
            ply.blood_spikes3 = self.blood_spikes3


            local right = ply:GetRight() 
            local left = -right

            local offsetAmount = 50

            local rightPos = (trace.HitPos + left * offsetAmount) + Vector(0,0,-100)
            local leftPos = (trace.HitPos + right * offsetAmount) + Vector(0,0,-100)

            local angle1 = (leftPos - rightPos):Angle() + Angle(0,-ply:EyeAngles().r,0)
            local angle2 = (rightPos - leftPos):Angle() + Angle(0,ply:EyeAngles().r,0)
                
            self.blood_spikes2:SetAngles(angle1)
            self.blood_spikes3:SetAngles(angle2)
            
            self.blood_spikes2:SetPos(rightPos)
            self.blood_spikes3:SetPos(leftPos)

            self.blood_spikes:SetPos(trace.HitPos + Vector(0,0,-100))
            self.blood_spikes:SetAngles(Angle(0, ply:EyeAngles().r, 0))
            self.blood_spikes:EmitSound("bloodmanipulation/blood_spikes.wav", 400, math.random(100,120), 1, CHAN_STATIC, SND_NOFLAGS)


            local scalene = 2

            timer.Create("spikes_go_up", 0.03, 8, function()
                if !IsValid(self.blood_spikes) or !IsValid(self.blood_spikes2) or !IsValid(self.blood_spikes3) then return end
                
                scalene = scalene + 2.5
                self.blood_spikes:SetPos(self.blood_spikes:GetPos() + Vector(0,0,scalene))
            end)
            timer.Create("spikes_go_up2", 0.031, 8, function()
                if !IsValid(self.blood_spikes) or !IsValid(self.blood_spikes2) or !IsValid(self.blood_spikes3) then return end
                
                self.blood_spikes2:SetPos(self.blood_spikes2:GetPos() + Vector(0,0,scalene))
            end)

            timer.Create("spikes_go_up3", 0.035, 8, function()
                if !IsValid(self.blood_spikes) or !IsValid(self.blood_spikes2) or !IsValid(self.blood_spikes3) then return end
                
                self.blood_spikes3:SetPos(self.blood_spikes3:GetPos() + Vector(0,0,scalene))
            end)
            timer.Simple(0.1, function()
                if !IsValid(self.blood_spikes) or !IsValid(self.blood_spikes2) or !IsValid(self.blood_spikes3) then return end

                ParticleEffect("bm_blood_bounce", self.blood_spikes:GetPos() + Vector(0, 0, 100), Angle(0,0,0), self)
                ParticleEffect("bm_blood_bounce", self.blood_spikes2:GetPos()+ Vector(0, 0, 100), Angle(0,0,0), self)
                ParticleEffect("bm_blood_bounce", self.blood_spikes3:GetPos()+ Vector(0, 0, 100), Angle(0,0,0), self)


                local entities  = ents.FindInSphere(self.blood_spikes:GetPos(), 200)
                local entities2 = ents.FindInSphere(self.blood_spikes2:GetPos(), 200)
                local entities3 = ents.FindInSphere(self.blood_spikes3:GetPos(), 200)
                local lentities  = {} 
            
                for _, ent in ipairs(entities) do
                    if IsValid(ent) and ent ~= ply and ent:IsSolid() and !ent:IsWorld() and !ent:GetNWBool("barrier") then
                        table.insert(lentities, ent)
                    end
                end
            
                for _, ent in ipairs(entities2) do
                    if IsValid(ent) and ent ~= ply and ent:IsSolid() and !ent:IsWorld() and !ent:GetNWBool("barrier") then
                        table.insert(lentities, ent)
                    end
                end

                for _, ent in ipairs(entities3) do
                    if IsValid(ent) and ent ~= ply and ent:IsSolid() and !ent:IsWorld() and !ent:GetNWBool("barrier") then
                        table.insert(lentities, ent)
                    end
                end

                for _, ent in ipairs(lentities) do
                    if ( !IsValid(ent) or ent == ply) then return end 
                    ParticleEffect( "bm_blood_hit", ent:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )

                    ent:EmitSound("bloodmanipulation/spike_hit.wav", 400, math.random(120,170), 1, CHAN_STATIC)
                    ent:TakeDamage(damage, ply, self)
        
                    local phys = ent:GetPhysicsObject()

                    if IsValid(phys) then 
                        phys:SetVelocity(Vector(0,0,600)) 
        
                    end

                    ent:SetVelocity(Vector(0,0,600)) 

                    if self.wingking then
                        self:Poison(ply, ent, 0.2, 3, 100)
                    end
                
                    util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)
                    self.flowing_red = self.flowing_red + 5

                end
            end)
            timer.Simple(0.5, function()
                if !IsValid(self.blood_spikes) or !IsValid(self.blood_spikes2) or !IsValid(self.blood_spikes3) then return end

                self.blood_spikes:SetModelScale(0.01, 0.1)
                self.blood_spikes2:SetModelScale(0.01, 0.1)
                self.blood_spikes3:SetModelScale(0.01, 0.1)

                timer.Create("spikes_go_down", 0.05, 8, function()
                    if !IsValid(self.blood_spikes) or !IsValid(self.blood_spikes2) or !IsValid(self.blood_spikes3) then return end
                    scalene = scalene + 2.5
                    self.blood_spikes:SetPos(self.blood_spikes:GetPos() + Vector(0,0,-scalene))
                    self.blood_spikes2:SetPos(self.blood_spikes2:GetPos() + Vector(0,0,-scalene))
                    self.blood_spikes3:SetPos(self.blood_spikes3:GetPos() + Vector(0,0,-scalene))

                end)

                timer.Simple(0.1, function()
                    if IsValid(self.blood_spikes) then
                        self.blood_spikes:Remove()
                    end
                    if IsValid(self.blood_spikes2) then
                        self.blood_spikes2:Remove()
                    end
                    if IsValid(self.blood_spikes3) then
                        self.blood_spikes3:Remove()
                    end
                end)
            end)
        end
        timer.Create("spikes-debris", 0, 1000, function()
            

            if !ply:Alive() then 
                if IsValid(ply.blood_spikes) then
                    ply.blood_spikes:Remove()
                end
                if IsValid(ply.blood_spikes2) then
                    ply.blood_spikes:Remove()
                end
                if IsValid(ply.blood_spikes3) then
                    ply.blood_spikes:Remove()
                end
            end
        end)
      
    end

    timer.Simple(cooldown, function()
        self.spikes = false
        if IsValid(self.blood_spikes) then
            self.blood_spikes:Remove()
        end
        if IsValid(self.blood_spikes2) then
            self.blood_spikes2:Remove()
        end
        if IsValid(self.blood_spikes3) then
            self.blood_spikes3:Remove()
        end
    end)
end

function SWEP:Chakrams(ply, condition)
    if self.single_chakram then return end
    self.single_chakram = true 

    local cooldown = 15
    local damage = 2
    local speed = 2000
    local scale = 0.2
    local radius = 50

    if self.red_scale then
        damage = damage*1.2
    end

    if ply:GetNWBool("bm_zone") then
        damage = damage*1.5
        speed = 3000
        scale = 1
        radius = 100
    end

    if SERVER then
        self.s_chakram = ents.Create("prop_dynamic")
    end
    self:SetHoldType('magic')

    if IsValid(self.s_chakram) then 
        self.s_chakram:SetModel("models/bloodmanipulation/blood_razors.mdl")
        self.s_chakram:SetMaterial("bloodmanipulation/effects/bloodystream")
        self.s_chakram:SetColor(Color(255, 255, 255, 250))
        self.s_chakram:SetRenderMode( RENDERMODE_TRANSALPHA )
        self.s_chakram:SetModelScale(0.01)
        self.s_chakram:SetModelScale(scale, 0.5)
        self.s_chakram:SetMoveType( MOVETYPE_NOCLIP )
        self.s_chakram:Spawn()

        local trace = util.TraceLine({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + ( ply:GetAimVector() * 100 ),
            filter = ply
        })

        self.s_chakram:SetPos(trace.HitPos)
        ply.s_chakram = self.s_chakram
        
        local spinSpeed = 1000

        local throw = false

        self.s_chakram:EmitSound("bloodmanipulation/slicer_create.wav", 350, 100, 1, CHAN_AUTO, SND_NOFLAGS)
        timer.Create("chakram_create", 0, 100, function()
            if !IsValid(self.s_chakram) or throw then return end

            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + ( ply:GetAimVector() * 100 ),
                filter = ply
            })

            self.s_chakram:SetPos(trace.HitPos)

        end)

        timer.Create("chakram_debris", 0, 800, function()
            if !IsValid(ply.s_chakram) or ply:Alive() then return end
            ply.s_chakram:Remove()
        end)

        timer.Create("chakram_effects", 0, 600, function()
            if !IsValid(self.s_chakram) then return end

            local orbitRadius   = 20
            local orbitSpeed    = 3
            local offset = Vector(0,0,10)
            if ply:GetNWBool("bm_zone") then
                orbitRadius = 70
                orbitSpeed  = 10
            end
            local orbitAngle = CurTime() * orbitSpeed
            orbitRadius = math.max(orbitRadius, 0)
    
            local pos1 = self.s_chakram:GetPos() - Vector(0,0,10) + Vector(math.cos(orbitAngle) * orbitRadius, math.sin(orbitAngle) * orbitRadius, 0)
            local pos2 = self.s_chakram:GetPos() - Vector(0,0,10)  + Vector(math.cos(orbitAngle + math.pi) * orbitRadius, math.sin(orbitAngle + math.pi) * orbitRadius, 0)
          
            ParticleEffect("bm_chak_trail", pos1 + offset , Angle(0, 0, 0), self)
            ParticleEffect("bm_chak_trail", pos2 + offset, Angle(0, 0, 0), self)

            local chakramAngles = self.s_chakram:GetAngles()

            chakramAngles:RotateAroundAxis(Vector(0, 0, 1), spinSpeed)
            self.s_chakram:SetAngles(chakramAngles)
        end)

        timer.Simple(1, function()
            if !IsValid(self.s_chakram) then return end

            ParticleEffect("bm_blood_bounce", self.s_chakram:GetPos(), Angle(0,0,0), self)

            self:SetHoldType(self.defaultHoldType) 

            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + ( ply:GetAimVector() * 100 ),
                filter = ply
            })

            local dir = (trace.HitPos - ply:EyePos()):GetNormalized()
            local movement = dir * speed
            local movementTime = 0.01
            local target = nil
            local detectRange = 2000
            self.s_chakram:EmitSound("bloodmanipulation/exrothrow.wav", 350, 100, 1, CHAN_AUTO, SND_NOFLAGS)

            throw = true
            timer.Create("chakram_single", 0, 500, function() 
                if !IsValid(self.s_chakram) then return end
    
                local currentAngles = self.s_chakram:GetAngles()
                currentAngles:RotateAroundAxis(Vector(0, 0, 1), spinSpeed)
                self.s_chakram:SetAngles(currentAngles)
            
                local entities = ents.FindInSphere(self.s_chakram:GetPos(), detectRange)
                local closestTarget = nil
                local closestDistance = math.huge
            
                for _, ent in ipairs(entities) do
                    if ent:IsValid() and (ent ~= ply) and (ent:IsPlayer() or ent:IsNextBot() or ent:IsNPC()) and !ent:GetNWBool("barrier") then
                        local distanceToEnt = self.s_chakram:GetPos():Distance(ent:GetPos())
                        if distanceToEnt < closestDistance then
                            closestDistance = distanceToEnt
                            closestTarget = ent
                        end
                    end
                end
    
                if IsValid(closestTarget) then
                    target = closestTarget
                else
                    target = nil
                end
            
                local targetPos
    
                local chakramPos = self.s_chakram:GetPos()
    
                if IsValid(target) then
                    targetPos = target:GetPos() + Vector(0, 0, 40) 
                    dir = (targetPos - chakramPos):GetNormalized()
    
                    local distance = chakramPos:Distance(targetPos)
    
                    if distance <= radius then
        
                        if SERVER then
                            target:TakeDamage(damage, ply, self)
                            ParticleEffect("bm_chak_hit", target:GetPos() + Vector(0,0,40), Angle(math.random(-360, 360), math.random(-360, 360), math.random(-360, 360)))
                            target:EmitSound("bloodmanipulation/slice_hit.wav", 350, math.random(80,120), 1, CHAN_STATIC, SND_NOFLAGS)
                            self.flowing_red = self.flowing_red + 0.5

                        end
                    end
                else

                    local entities = ents.FindInSphere(self.s_chakram:GetPos(), radius)

                    for _, ent in ipairs(entities) do
                        if SERVER and IsValid(ent) and ent ~= ply and ent:IsSolid() and !ent:GetNWBool("barrier") then
                            ent:TakeDamage(damage, ply, self)
                            ParticleEffect("bm_chak_hit", ent:GetPos() + Vector(0,0,40), Angle(math.random(-360, 360), math.random(-360, 360), math.random(-360, 360)))
                            ent:EmitSound("bloodmanipulation/slice_hit.wav", 350, math.random(80,120), 1, CHAN_STATIC, SND_NOFLAGS)
                            self.flowing_red = self.flowing_red + 0.5

                        end
                    end

                end
    
                local movement = dir * speed * movementTime
                self.s_chakram:SetPos(chakramPos + movement)

            end)
        end)
        timer.Simple(5, function()
            if IsValid(self.s_chakram) then
                self.s_chakram:Remove()
            end
        end)
        
        timer.Simple(cooldown, function()
            if IsValid(self.s_chakram) then
                self.s_chakram:Remove()
            end
            self.single_chakram = false

        end)
    end
end

function SWEP:BloodBind(ply)
    if self.bind then return end
    self.bind = true 

    local cooldown = 5
    local damage = 25
    local got = false
    local speed = 5000

    if ply:GetNWBool("bm_zone") then
        damage = damage*1.5
    end

    if self.red_scale then
        damage = damage*1.2
    end

    self:SetHoldType('melee')
    ply:SetAnimation(PLAYER_ATTACK1)

    timer.Simple(cooldown, function() 
        self.bind = false 
        self:SetHoldType(self.defaultHoldType) 
        if IsValid(self.bind_ball) then
            self.bind_ball:Remove()
        end
    end)

    local function binded()
        if SERVER then
            self.binds = ents.Create("prop_dynamic")
            self.bind_sparks = ents.Create("env_sprite")
    
            if IsValid(self.binds) then
                
                self.binds:SetModel("models/bloodmanipulation/bm_bind.mdl")
                self.binds:SetMaterial("bloodmanipulation/effects/bloodystream")
                self.binds:SetColor(Color(225, 31, 70, 0))
                self.binds:SetRenderMode( RENDERMODE_TRANSALPHA )
                self.binds:SetModelScale(0.01)
                self.binds:SetMoveType( MOVETYPE_NOCLIP )
                self.binds:DrawShadow(false)
    
                self.bind_sparks:SetKeyValue("rendercolor", "200, 0, 50")
                self.bind_sparks:SetKeyValue("HDRColorScale", "1")
                self.bind_sparks:SetKeyValue("rendermode", "5")
                self.bind_sparks:SetKeyValue("model", "minwool/jjk/effects/black_flash/sparks_stars.vmt")
                self.bind_sparks:SetKeyValue("scale", "1.5")
    
                self.binds:Spawn()
                self.bind_sparks:Spawn()

                ply.binds = self.binds
    
                if IsValid(self.bind_ball) then
                    self.binds:SetPos(self.bind_ball:GetPos())
                
                    self.bind_sparks:SetParent(self.binds)
                    self.bind_sparks:SetLocalPos(Vector(0,0,0))
        
                    ParticleEffect( "bm_blood_slice", self.bind_ball:GetPos(), Angle(ply:EyeAngles().p, ply:EyeAngles().y, 45), ply )
                    ParticleEffect( "bm_blood_slice", self.bind_ball:GetPos(), Angle(ply:EyeAngles().p, ply:EyeAngles().y, -45), ply )
        
                    self.binds:EmitSound("bloodmanipulation/slice_hit.wav", 340, math.random(100, 150), 1, CHAN_STATIC)    
                    self.binds:EmitSound("bloodmanipulation/slice_hit.wav", 340, math.random(100, 150), 1, CHAN_STATIC)    
                    
                    self.bind_ball:Remove()
                
                end
                timer.Simple(0.2, function()
                    if !IsValid(self.binds) then return end

                  
                    timer.Simple(0.5, function()
                        if IsValid(self.bind_sparks) then
                            self.bind_sparks:Remove()
                        end
        
                    
                    end)
                    util.ScreenShake(ply:GetPos(), 10, 40, 1, 600, true)
    
                    local entities = ents.FindInSphere(self.binds:GetPos(), 200)
                    local target = nil
    
                    for _, lent in ipairs(entities) do
                        if IsValid(lent) and !IsValid(target) and lent ~= ply and (lent:IsNPC() or lent:IsPlayer() or lent:IsNextBot()) then
                            target = lent
                        end
                    end
    
                    if IsValid(target) then
                        local ent = target
                        if ( IsValid(ent) and SERVER ) then
    
                            local mins = ent:OBBMins()
                            local maxs = ent:OBBMaxs()
                            local size = maxs - mins
    
                            self.binds:SetColor(Color(225, 31, 70))
                            self.binds:SetModelScale(size:Length()*0.007, 0.3)
    
                            ParticleEffect( "bm_blood_hit", self.binds:GetPos() + Vector(0,0,10), Angle(0,0,0), ply )
                            ParticleEffect( "bm_supernova_2", self.binds:GetPos() + Vector(0,0,10), Angle(0,0,0), ply )
    
                            local phys = ent:GetPhysicsObject()
                        
                            if IsValid(phys) then
                                if IsValid(phys) then phys:SetVelocity(Vector(0,0,0)) end
                            end
    
                            self.flowing_red = self.flowing_red + 20
                            self.binds:EmitSound("bloodmanipulation/blood_bind.wav", 400, 100, 1, CHAN_STATIC)    
                            ent:TakeDamage(damage, ply, self)
    
                            if self.wingking then
                                self:Poison(ply, ent, 0.1, 10, damage)
    
                            end
    
                            local savedPos = ent:GetPos()
                            timer.Create("blood_bind", 0, 200, function()
                                if !IsValid(self.binds) then return end
                                if !IsValid(ent) then
                                    self.binds:Remove()
                                    return 
                                end
    
                                ent:SetPos(savedPos)
    
                                spine = ent:LookupBone("ValveBiped.Bip01_Spine")
                                
                                if spine then 
                                    offsetVec = Vector(0, 10, 0)
                                    offsetAng = Angle(90, 0, 0)
    
                                    local matrix = ent:GetBoneMatrix(spine)
                                    if !matrix then return end
        
                                    local newPos, newAng = LocalToWorld(offsetVec, offsetAng, matrix:GetTranslation(), matrix:GetAngles())
                                    
                                    self.binds:SetPos(newPos)
                                    self.binds:SetAngles(newAng)
                                
                                else
    
                                    if ent:IsNextBot() then
                                        self.binds:SetAngles(ply:EyeAngles() + Angle(0,90,0))
                                        self.binds:SetPos(ent:GetPos() + Vector(0,0,60))
    
                                    elseif ent:IsNPC() then
                                        self.binds:SetPos(ent:GetPos() + Vector(0,0,0))
                                    else
                                        self.binds:EyeAngles(ent:EyeAngles())
                                    end
                                    
                                    
                                end
                                
    
                            end)
    
                            timer.Simple(2, function()
                                if !IsValid(self.binds) then return end
                                self.binds:Remove()
                            end)
                        end
                    else
                        self.binds:Remove()
        
                    end
                    
    
                end)
    
            end
        end

    end

    if SERVER then
        self.bind_ball = ents.Create("prop_dynamic")

        if IsValid(self.bind_ball) then
            self.bind_ball:SetModel("models/xqm/rails/gumball_1.mdl")
            self.bind_ball:SetMaterial("minwool/jjk/solid_glow")
            self.bind_ball:SetColor(Color(153, 16, 44, 241))
            self.bind_ball:SetRenderMode( RENDERMODE_TRANSALPHA )
            self.bind_ball:SetModelScale(0.2, 0.3)
            self.bind_ball:SetMoveType( MOVETYPE_NOCLIP )
            self.bind_ball:DrawShadow(false)

            self.bind_ball:Spawn()

            ply.bind_ball = self.bind_ball

            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * 100),
                filter = ply
            })

            self.bind_ball:SetPos(trace.HitPos)
            self.bind_ball:EmitSound("bloodmanipulation/slicer_create.wav", 400, 100, 1, CHAN_STATIC)    

            local dir = (trace.HitPos - ply:EyePos()):GetNormalized()
            local movement = dir * speed
            local movementTime = 0.01
            timer.Create("bind_ball_debris", 0, 1000, function()
                if !IsValid(ply.bind_ball) or !IsValid(ply.binds) or ply:Alive() then return end
                ply.bind_ball:Remove()
                ply.binds:Remove()
            end)

            timer.Create("blood_ball_lifetime", 0, 500, function()
                if !(IsValid(self.bind_ball)) or got then return end
            
                local newPos = self.bind_ball:GetPos() + movement * movementTime
                self.bind_ball:SetPos(newPos)
                ParticleEffect("bm_chak_trail", self.bind_ball:GetPos(), Angle(0,0,0), self)

                local entities = ents.FindInSphere(self.bind_ball:GetPos(), 100)
    
                for _, ent in ipairs(entities) do

                    if ( ent:IsValid() and !got and ent ~= self.bind_ball and ent ~= ply and ent:IsSolid() ) and !( ent:GetNWBool("barrier") ) then
                        if SERVER then
                            binded()
                            got = true
                         end
                    end
                end
            end)
        end
    end
    
end

SWEP.sn_tick = false

function SWEP:SupernovaExplode(ply, damage)
    if !IsValid(self.nova_ball) then return end 

    local cooldown = 10

    self.nova_ball:SetModelScale(3, 0.1)

    timer.Simple(0.2, function()
        if !IsValid(self.nova_ball) then return end 
    
    
        ParticleEffect( "bm_supernova", self.nova_ball:GetPos(), Angle(0,0,0), ent )
        self.nova_ball:EmitSound("bloodmanipulation/supernova.wav", 350, 100, 1, CHAN_AUTO)
        
    
        util.ScreenShake(self.nova_ball:GetPos(), 500, 40, 5, 4000, true)
    
        local entities = ents.FindInSphere(self.nova_ball:GetPos(), 200)
    
        for _, ent in ipairs(entities) do
    
            if ent:IsValid() and ( ent ~= ply and ent ~= self.nova_ball ) and !ent:GetNWBool("barrier") then
                if SERVER then
    
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 2000
    
                    local phys = ent:GetPhysicsObject()
                    
                    if IsValid(phys) then
                        phys:EnableMotion(true)
                        constraint.RemoveAll(ent)
    
                        phys:SetVelocity(dir * force)
                    end
    
    
                    ent:SetVelocity((dir * force))
                    
                    ent:TakeDamage(damage, ply, self)
    
                    self.flowing_red = self.flowing_red + 5
    
                    if self.wingking then
                        self:Poison(ply, ent, 0.5, 5, 100)
    
                    end
    
                end
            end
        end
    
        if IsValid(self.nova_ball) then
            self.nova_ball:Remove()
            
        end
    end)
    self.supernova = true
    timer.Simple(cooldown, function() 
        self.supernova = false 
        
    end)
end

function SWEP:Supernova(ply)
    if self.supernova then return end
    self.supernova = true

    local damage = 500
    local cooldown = 0.2
    local gorp = false
    local speed = 3000

    if ply:GetNWBool("bm_zone") then
        damage = damage*1.5
    end

    if self.red_scale then
        damage = damage*1.2
    end

    if self.sn_tick then

        self.sn_tick = false

        self:SupernovaExplode(ply, damage)

        timer.Simple(0.5, function()
            if IsValid(self.nova_ball) then
                self.nova_ball:Remove()
            end
            self:SetHoldType(self.defaultHoldType) 

        end)

        return
    end

    self.sn_tick = true
    
    self:SetHoldType('magic')


    if SERVER then
        self.nova_ball = ents.Create("prop_dynamic")
        self.nova_glow = ents.Create("env_sprite")
    end

    if IsValid(self.nova_ball) then
        self.nova_ball:SetModel("models/xqm/rails/gumball_1.mdl")
        self.nova_ball:SetMaterial("minwool/jjk/solid_glow")
        self.nova_ball:SetColor(Color(153, 16, 44, 241))
        self.nova_ball:SetRenderMode( RENDERMODE_TRANSALPHA )
        self.nova_ball:SetModelScale(0.01)
        self.nova_ball:SetMoveType( MOVETYPE_NOCLIP )
        self.nova_ball:DrawShadow(false)

        self.nova_glow:SetKeyValue("rendercolor", "200, 0, 50")
        self.nova_glow:SetKeyValue("HDRColorScale", "1")
        self.nova_glow:SetKeyValue("rendermode", "5")
        self.nova_glow:SetKeyValue("model", "bloodmanipulation/effects/blood_end.vmt")
        self.nova_glow:SetKeyValue("scale", "0.1")

        self.nova_glow:Spawn()
        self.nova_ball:Spawn()

        self.nova_glow:SetParent(self.nova_ball)
        self.nova_glow:SetLocalPos(Vector(0,0,0))

        ply.nova_ball = self.nova_ball

        local trace = util.TraceLine({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * 100),
            filter = ply
        })
    
        self.nova_ball:SetPos(trace.HitPos)
        self.nova_ball:SetModelScale(0.2, 1)
        self.nova_ball:EmitSound("bloodmanipulation/slicer_create.wav", 400, 100, 1, CHAN_STATIC)   

        timer.Create("nova_ball_debris", 0, 1000, function()
            if !IsValid(ply.nova_ball) or ply:Alive() then return end
            ply.nova_ball:Remove()
        end)

        timer.Create("nova_ball_tracer", 0, 100, function()
            if !IsValid(self.nova_ball) or gorp then return end

            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * 100),
                filter = ply
            })

            self.nova_ball:SetPos(trace.HitPos)

        end)

        timer.Simple(1, function()
            gorp = true
           
            self.supernova = false

            self:SetHoldType('melee')
            ply:SetAnimation(PLAYER_ATTACK1)

            timer.Simple(0.3, function()
                self:SetHoldType(self.defaultHoldType) 
            end)

            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * 100),
                filter = ply
            })

            local dir = (trace.HitPos - ply:EyePos()):GetNormalized()
            local movement = dir * speed
            local movementTime = 0.01
            local target = nil
            local radius = 50
            local detectRange = 2000

            self.nova_ball:EmitSound("bloodmanipulation/exrothrow.wav", 350, 100, 1, CHAN_AUTO, SND_NOFLAGS)
            
            timer.Create("supernova_ball", 0, 500, function() 
                if !IsValid(self.nova_ball) or got then return end

                ParticleEffect("bm_chak_trail", self.nova_ball:GetPos(), Angle(0,0,0), self)

                local entities = ents.FindInSphere(self.nova_ball:GetPos(), detectRange)
                local closestTarget = nil
                local closestDistance = math.huge
            
                for _, ent in ipairs(entities) do
                    if ent:IsValid() and (ent ~= ply) and (ent:IsPlayer() or ent:IsNextBot() or ent:IsNPC()) and !ent:GetNWBool("barrier") then
                        local distanceToEnt = self.nova_ball:GetPos():Distance(ent:GetPos())
                        if distanceToEnt < closestDistance then
                            closestDistance = distanceToEnt
                            closestTarget = ent
                        end
                    end
                end
    
                if IsValid(closestTarget) then
                    target = closestTarget
                else
                    target = nil
                end
            
                local targetPos
    
                local pos = self.nova_ball:GetPos()
    
                if IsValid(target) then
                    targetPos = target:GetPos() + Vector(0, 0, 40) 

                    dir = (targetPos - pos):GetNormalized()
    
                end
    
                local movement = dir * speed * movementTime
                self.nova_ball:SetPos(pos + movement)
            end)
        end)
        
    end
   


end

function SWEP:Poison(ply, ent, dur, rep, dmg)
    if ply:GetNWBool("bm_zone") then
        rep = rep*2
        dmg = dmg*2
    end

    if ent:IsNPC() or ent:IsNextBot() or ent:IsPlayer() then
        if ent:Health() <= 0 then return end
        timer.Create("poison", dur, rep, function()

            if !IsValid(ent) then return end
    
            ent:TakeDamage(dmg, ply, self)
            ent:EmitSound("bloodmanipulation/poison.wav", 350,  math.random(80, 120), 1, CHAN_STATIC)
            ParticleEffect( "bm_blood_hit", ent:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
    
        end)
    end
  
end

function SWEP:BloodEdge(ply, condition) -- catch these hands

    if condition then
        if (self.blood_slice or !IsValid(ply)) then return end
        self.blood_slice = true
    
        local range = 200
        local damage = 20
        local cooldown = 2
    
        if ply:GetNWBool("bm_zone") then
            damage = damage*1.5
        end
        if self.red_scale then
            damage = damage*1.2
        end
        timer.Simple(cooldown, function() self.blood_slice = false end)
    
        self:SetHoldType("knife")
        timer.Simple(1, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)
        ply:SetAnimation(PLAYER_ATTACK1)
        if SERVER then
            self.blood_spark = ents.Create("env_sprite")
            self.blood_light = ents.Create("light_dynamic")
        end
    
        if IsValid(self.blood_spark) then
            self.blood_spark:SetKeyValue("rendercolor", "255, 0, 0")
            self.blood_spark:SetKeyValue("HDRColorScale", "1")
            self.blood_spark:SetKeyValue("rendermode", "5")
            self.blood_spark:SetKeyValue("model", "minwool/jjk/effects/black_flash/sparks_stars.vmt")
            self.blood_spark:SetKeyValue("scale", "2")
      
            self.blood_light:SetKeyValue("brightness", "3")
            self.blood_light:SetKeyValue("distance", "200")
            self.blood_light:SetKeyValue("_light", "255, 0, 0")
    
            self.blood_spark:Spawn()
            self.blood_light:Spawn()
    
            self.blood_light:SetParent(self.blood_spark)
            self.blood_light:SetLocalPos(Vector(0,0,0))
    
            self.blood_spark:SetPos(ply:GetPos())
          
            ply.blood_spark = self.blood_spark
            
            timer.Simple(0.5, function()
                self.blood_spark:Remove()
            end)
    
            timer.Create("debris", 0, 1000, function()
                if !ply:Alive() then
                    if IsValid(ply.blood_spark) then
                        ply.blood_spark:Remove()
                    end
                end
            end)
        end
    
        timer.Create("vs_barrage_think", 0.05, 10, function()
            self:SetHoldType('knife')
            ply:SetAnimation(PLAYER_ATTACK1)
            ply:EmitSound("bloodmanipulation/spike_hit.wav", 340, math.random(100, 150), 1, CHAN_STATIC)
            ply:EmitSound("bloodmanipulation/edge_swing.wav", 340, math.random(80, 100), 1, CHAN_STATIC)

            local trace = util.TraceHull({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
                filter = ply,
                maxs = {45,45,45},
                mins = {-45,-45,-45}
            })
            if IsValid(self.blood_spark) then
                self.blood_spark:SetPos(trace.HitPos)
    
            end
            ParticleEffect( "bm_blood_slice", trace.HitPos + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(-360,360),math.random(-360,360),math.random(-360,360)), ply )
    
            local entities = ents.FindInSphere(trace.HitPos, 600)
            local lentities  = {} 
        
            for _, ent in ipairs(entities) do
                if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                    table.insert(lentities, ent)
                end
            end
        
            for _, ent in ipairs(lentities) do
                if ( !IsValid(ent) or !SERVER ) then return end 
                ParticleEffect( "bm_blood_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                ent:EmitSound("bloodmanipulation/slice_hit.wav", 340, math.random(100, 150), 1, CHAN_STATIC)    
                ent:TakeDamage(damage, ply, self)
                self.flowing_red = self.flowing_red + 0.5

            end

            util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)

        end)
    
        timer.Simple(0.6, function()
            if IsValid(self.blood_spark) then
                self.blood_spark:SetPos(ply:GetAimVector()*range)
    
            end
    
            self:SetHoldType('melee')
            ply:SetAnimation(PLAYER_ATTACK1)
    
            ply:EmitSound("bloodmanipulation/edge_swing.wav", 340, 80, 1, CHAN_STATIC)
            local trace = util.TraceHull({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
                filter = ply,
                maxs = {45,45,45},
                mins = {-45,-45,-45}
            })
            ParticleEffect( "bm_blood_slice", trace.HitPos + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(-360,360),math.random(-360,360),math.random(-360,360)), ply )
    
            local entities = ents.FindInSphere(trace.HitPos, range*1.5)
            local lentities  = {} 
        
            for _, ent in ipairs(entities) do
                if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                    table.insert(lentities, ent)
                end
            end
        
            for _, ent in ipairs(lentities) do
                if ( !IsValid(ent) or !SERVER ) then return end 
                ParticleEffect( "bm_blood_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                ent:EmitSound("bloodmanipulation/slice_hit.wav", 340, 80, 1, CHAN_STATIC)
    
                ent:TakeDamage(damage, ply, self)
                util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)
                self.flowing_red = self.flowing_red + 0.5

                if self.wingking then
                    self:Poison(ply, ent, 0.3, 10, 100)

                end
            end
        end)
        return
    end

    local ply = self:GetOwner()
    
    if ( !IsValid(ply) or !SERVER ) then return end

    local swing   = {'bloodmanipulation/edge_swing.wav'}
    local hit     = 'bloodmanipulation/spike_hit.wav'

    local damage = 50

    if ply:GetNWBool("bm_zone") then
        damage = damage*1.5
    end
    
    if self.red_scale then
        damage = damage*1.2
    end

    swing = swing[math.random(#swing)]

    local trace = util.TraceHull({
        start = ply:GetShootPos(),
        endpos = ply:GetShootPos() + (ply:GetAimVector() * 400),
        filter = ply,
        mins = {-45,-45,-45},
        maxs = {45,45,45}
      
    })

    local entities = ents.FindInSphere(trace.HitPos, 100)
    local lentities  = {} 

    for _, ent in ipairs(entities) do
        if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
            table.insert(lentities, ent)
        end
    end
        
    self:SetHoldType('knife')
    ply:SetAnimation(PLAYER_ATTACK1)
    timer.Simple(1, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

    timer.Simple(0.1, function()
        ply:EmitSound(swing, 340, math.random(90,100), 1, CHAN_STATIC)
        ParticleEffect( "bm_blood_hit", trace.HitPos, Angle(0,ply:EyeAngles().y, math.random(-360, 360)), ply )
        ParticleEffect( "bm_blood_slice", trace.HitPos, Angle(0,ply:EyeAngles().y, math.random(-360, 360)), ply )

        if #lentities > 0 then

            ParticleEffect( "bm_chak_hit", trace.HitPos, Angle(0,0,0), ply )
            util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true)

        end


        for _, ent in ipairs(lentities) do

            if ( IsValid(ent) and SERVER ) then
            
    
                local phys = ent:GetPhysicsObject()
            
                if IsValid(phys) then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 500
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                end

                
                ent:EmitSound(hit, 340, math.random(80, 100), 2, CHAN_STATIC)
                ent:TakeDamage(damage, ply, self) 
                self.flowing_red = self.flowing_red + 1

                if self.wingking then
                    self:Poison(ply, ent, 0.1, 3, 50)

                end
            end
        end
     
    end)
end

function SWEP:BloodMeteors(ply)
    if self.meteorshower then return end
    self.meteorshower = true 

    local cooldown = 15
    local intensity = 40

    if ply:GetNWBool("bm_zone") then
        intensity = 60
    end

    timer.Simple(cooldown, function()
        self.meteorshower = false 
        ply:ChatPrint("~ Blood Meteor Shower is off cooldown ~")


    end)

    if SERVER then
        
        timer.Create("meteor_shower", 0.05, intensity, function()
            if !IsValid(ply) then return end
            if SERVER then
                local meteor = ents.Create("bm_meteorite")
                meteor:Spawn()
                meteor:SetPos(ply:GetPos() + Vector(math.random(-600, 600), math.random(-600, 600), 2000))
                meteor:SetOwner(ply)
            end
                
        end)
        ply:ChatPrint("Blood Meteor Shower is on cooldown ~ 15 seconds")

    end
end

function SWEP:StatusEffect(ply)
    if IsValid(self.awaken) then self.awaken:Remove() end
    if SERVER then
        self.awaken = ents.Create("env_sprite")

        if IsValid(self.awaken) then
            self.awaken:SetKeyValue("rendercolor", "255, 255, 255")
            self.awaken:SetKeyValue("GlowProxySize", "3")
            self.awaken:SetKeyValue("HDRColorScale", "1")
            self.awaken:SetKeyValue("renderfx", "20")
            self.awaken:SetKeyValue("rendermode", "5")
            self.awaken:SetKeyValue("renderamt", "255")
            self.awaken:SetKeyValue("model", "bloodmanipulation/effects/flowing_red_scale.vmt")
            self.awaken:SetKeyValue("scale", "0.1")
            ply.awaken = self.awaken
            self.awaken:Spawn()
            self.awaken:SetPos(ply:GetPos() + Vector(0,0,100))

            ply:EmitSound("bloodmanipulation/flowing_red_scale.wav", 400, 100, 1, CHAN_AUTO)
        end
    end

    timer.Create("debris_awaken", 0, 500, function()
        
        if !ply:Alive() then 
            if IsValid(ply.awaken) then
                ply.awaken:Remove()
            end
        end

        if IsValid(self.awaken) then
            self.awaken:SetPos(ply:GetPos() + Vector(0,0,100))

        end
    
    end)

    timer.Simple(1, function()
        if IsValid(self.awaken) then
            self.awaken:Remove()
        end
    end)
end

SWEP.double_jump = false
SWEP.can_db = true
SWEP.connect_db = false
SWEP.wk_jump = false

function SWEP:KeyPress(ply, key)

    if key == IN_JUMP then
       
        if self.double_jump and !ply:OnGround() then
            self:Lunge(ply)

            if self.wingking then
                self.wk_jump = !self.wk_jump
            else
                self.wk_jump = false
            end

            self.double_jump = false


        end
        
    end

    if key == IN_USE then

        if ply:GetNWBool("bm_shift") then
            self:Chakrams(ply, false)
            return
        end
        self:Convergence(ply, false)
    
    elseif key == IN_RELOAD then
        if ply:GetNWBool("bm_shift") then
            self:BloodMeteors(ply)

            return
        end
        self:BloodSpikes(ply, false)

    end

    hook.Add("PlayerButtonDown", "bloodmanip_g", function(ply, button)
        if button == KEY_G and ply:GetActiveWeapon():GetClass() == "bloodmanipulation" then
            self:Supernova(ply)

        end
    end)

end

function SWEP:BlackFlash(ply, damage, lentities, trace)
    --black flash :OO
    if math.random(10) ~= 1 then
        ply:SetNWInt("bm_pity", 600)

    end

    ply:SetHealth(math.min(ply:Health() + 1500, 10000))

    util.ScreenShake( ply:GetPos(), 400, 40, 2, 1000, true)

    if #lentities > 0 then
        ParticleEffect("jjk_black_flash", trace.HitPos, Angle(0,0,0), ply)
    end

    if IsValid(self.bf_initial) then self.bf_initial:Remove() end
    if IsValid(self.bf_plyaura) then self.bf_plyaura:Remove() end

    if SERVER then
        self.bf_sparks  = ents.Create("env_sprite")
        self.bf_stars   = ents.Create("env_sprite")
        self.bf_initial = ents.Create("env_sprite")
        self.bf_light   = ents.Create("light_dynamic")

        self.bf_plyaura = ents.Create("env_sprite")
        self.bf_plylight = ents.Create("light_dynamic")

        if IsValid(self.bf_initial) and IsValid(self.bf_plyaura) then
            self.bf_sparks:SetKeyValue("rendercolor", "255, 255, 255")
            self.bf_sparks:SetKeyValue("HDRColorScale", "1")
            self.bf_sparks:SetKeyValue("rendermode", "9")
            self.bf_sparks:SetKeyValue("model", "minwool/jjk/effects/black_flash/sparks.vmt")
            self.bf_sparks:SetKeyValue("scale", "0.00001")

            self.bf_stars:SetKeyValue("rendercolor", "255, 0, 0")
            self.bf_stars:SetKeyValue("HDRColorScale", "5")
            self.bf_stars:SetKeyValue("rendermode", "9")
            self.bf_stars:SetKeyValue("model", "minwool/jjk/effects/black_flash/sparks_stars.vmt")
            self.bf_stars:SetKeyValue("scale", "0.00001")

            self.bf_initial:SetKeyValue("rendercolor", "255, 255, 255")
            self.bf_initial:SetKeyValue("HDRColorScale", "1")
            self.bf_initial:SetKeyValue("rendermode", "5")
            self.bf_initial:SetKeyValue("model", "minwool/jjk/effects/black_flash/initial_hit.vmt")
            self.bf_initial:SetKeyValue("scale", "4")

            self.bf_light:SetKeyValue("brightness", "3")
            self.bf_light:SetKeyValue("distance", "400")
            self.bf_light:SetKeyValue("_light", "255, 0, 50")

            self.bf_initial:Spawn()
            self.bf_stars:Spawn()
            self.bf_sparks:Spawn()
            self.bf_light:Spawn()

            self.bf_sparks:SetParent(self.bf_initial)
            self.bf_sparks:SetLocalPos(Vector(0,0,0))

            self.bf_stars:SetParent(self.bf_initial)
            self.bf_stars:SetLocalPos(Vector(0,0,0))

            self.bf_light:SetParent(self.bf_initial)
            self.bf_light:SetLocalPos(Vector(0,0,0))

            self.bf_initial:SetPos(trace.HitPos)

            ply.bf_initial = self.bf_initial

            self.bf_plyaura:SetKeyValue("rendercolor", "255, 255, 255")
            self.bf_plyaura:SetKeyValue("HDRColorScale", "1")
            self.bf_plyaura:SetKeyValue("rendermode", "5")
            self.bf_plyaura:SetKeyValue("model", "minwool/jjk/effects/black_flash/initial_hit.vmt")
            self.bf_plyaura:SetKeyValue("scale", "0.5")

            self.bf_plylight:SetKeyValue("brightness", "2")
            self.bf_plylight:SetKeyValue("distance", "200")
            self.bf_plylight:SetKeyValue("_light", "255, 0, 50")

            self.bf_plyaura:Spawn()
            self.bf_plylight:Spawn()

            ply.bf_plyaura = self.bf_plyaura
            self.bf_plylight:SetParent(self.bf_plyaura)
            self.bf_plylight:SetLocalPos(Vector(0,0,0))

            timer.Create("debris", 0, 250, function()
                if !ply:Alive() then
                    if IsValid(ply.bf_initial) then
                        ply.bf_initial:Remove()
                    end
                    if IsValid(ply.bf_plyaura) then
                        ply.bf_plyaura:Remove()
                    end
                end
            end)

            local y = 1
            local x = 0.5

            timer.Simple(0.5, function()              
                timer.Create("sparks_grow", 0.01, 5, function()
                    if !IsValid(ply.bf_initial) then return end
                    y = y + 1
                    self.bf_sparks:SetKeyValue("scale", y)
                    ParticleEffect("jjk_black_flash", trace.HitPos, Angle(0,0,0), ply)

                end)

                timer.Simple(0.5, function()
                    
                    timer.Create("sparks_grow", 0.01, 5, function()
                        y = y - 0.7
                        x = x + 0.2
                        if !IsValid(self.bf_initial) then return end

                        self.bf_sparks:SetKeyValue("scale", y)
                        self.bf_stars:SetKeyValue("scale", x)

                    end)
                    
                end)
            end)
           
            local wait = 2

            
            timer.Simple(wait, function()
                
                if IsValid(self.bf_initial) then
                    
                    timer.Create("sparks_grow", 0.05, 10, function()
                        y = y - 0.5
                        x = x - 0.25
                        if !IsValid(self.bf_initial) then return end
                        self.bf_sparks:SetKeyValue("scale", y)
                        self.bf_stars:SetKeyValue("scale", y)

                    end)
                    timer.Simple(1, function()

                        if IsValid(self.bf_initial) then
                            self.bf_initial:Remove()

                        end
                        if IsValid(self.bf_plyaura) then
                            self.bf_plyaura:Remove()

                        end
                    end)
                end
            end)
        end
    end

    for _, ent in ipairs(lentities) do

        if IsValid(ent) and SERVER then
            timer.Create("blackflash_sparks", 0, 500, function()
                if !IsValid(ent) then 
                    
                    if IsValid(self.bf_plyaura) then
                        self.bf_plyaura:Remove()

                    end
                    
                    if IsValid(self.bf_initial) then
                        self.bf_initial:Remove()

                    end

                    return 
                
                end

                if IsValid(self.bf_plyaura) then
                    self.bf_plyaura:SetPos(ply:GetPos() + Vector(0,0,40))
                end

                if IsValid(self.bf_initial) then
                    self.bf_initial:SetPos(ent:GetPos() + Vector(0,0,40))
                    util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true)

                end
            end)

            ent:EmitSound("minwool/jjk/blackflash.wav", 400, 100, 20, CHAN_AUTO, SND_SHOULDPAUSE)
        
            ent:TakeDamage((damage*5), ply, self)            
            util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 100, true)

            local phys = ent:GetPhysicsObject()
            
            if IsValid(phys) and SERVER then
                local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                local force = 10000
                if IsValid(phys) then phys:SetVelocity(dir * force) end
                ent:SetVelocity(dir * force) 
            end

            timer.Simple(0.7, function()
                if !IsValid(ent) then return end

                if IsValid(phys) and SERVER then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 10000
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                    ent:SetVelocity(dir * force) 
                end
    
                ent:TakeDamage((damage*5), ply, self)
                local rep = 4

                timer.Create("blackflash_surge", 0.1, rep, function()
                    if not IsValid(ent) then return end
                    ent:TakeDamage((damage*0.4), ply, self)
                    ParticleEffect( "jjk_bf_trail", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                end)

            end)
        end
    end 

    local entities = ents.FindInSphere( ply:GetPos(), 1000 )

    for _ , ent in ipairs(entities) do
        if ent:IsPlayer() then
            ent:ScreenFade(SCREENFADE.PURGE, Color(255, 255, 255, 247), 0.1, 0.1)
        end
    end

    if ply:GetNWBool("bm_zone") then 
       
        ply:ChatPrint("ANOTHER BLACK FLASH") 
        ply:SetNWInt("bm_zone_meter", ply:GetNWInt("bm_zone_meter") + 50)
        return
    end
    ply:SetNWInt("bm_zone_meter", 120)
    ply:SetNWBool("bm_zone", true)
    ply:ChatPrint("BLACK FLASH")
    ply:ChatPrint("~ you are in the zone ~")

end

function SWEP:DoPunch() -- catch these hands
    local ply = self:GetOwner()
    
    if ( !IsValid(ply) or !SERVER ) then return end

    local swing   = {'minwool/jjk/swing.wav','minwool/jjk/swing2.wav'}
    local hit     = 'minwool/jjk/hit.wav'

    local damage = 40

    swing = swing[math.random(#swing)]

    
    if ply:GetNWBool("bm_zone") then
        damage = damage*1.5
    end

    if self.red_scale then
        damage = damage*1.2
    end

    local trace = util.TraceHull({
        start = ply:GetShootPos(),
        endpos = ply:GetShootPos() + (ply:GetAimVector() * 400),
        filter = ply,
        mins = {-45,-45,-45},
        maxs = {45,45,45}
      
    })

    local entities = ents.FindInSphere(trace.HitPos, 100)
    local lentities  = {} 

    for _, ent in ipairs(entities) do
        if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
            table.insert(lentities, ent)
        end
    end
        
    self:SetHoldType('fist')
    ply:SetAnimation(PLAYER_ATTACK1)
    timer.Simple(1, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

    timer.Simple(0.1, function()
        ply:EmitSound(swing, 340, math.random(90,100), 1, CHAN_STATIC)

        if #lentities > 0 then

            ParticleEffect( "jjk_normal", trace.HitPos, Angle(0,0,0), ply )
            util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true)

            if math.random(1, ply:GetNWInt("bm_pity")) == 1 then -- black flash 
                self:BlackFlash(ply, damage, lentities, trace)
                return
            end
        end


        for _, ent in ipairs(lentities) do

            if ( IsValid(ent) and SERVER ) then
            
    
                local phys = ent:GetPhysicsObject()
            
                if IsValid(phys) then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 500
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                end

                self.flowing_red = self.flowing_red + 1
                ent:EmitSound(hit, 340, math.random(80, 100), 2, CHAN_STATIC)
                ent:TakeDamage(damage, ply, self) 

            end
        end
     
    end)
end

function SWEP:PrimaryAttack() 

    local ply = self:GetOwner()
    if ( !ply:IsValid() ) then return end

    if ply:GetNWInt("bm_mode") == 1 then
        self:BloodEdge(ply, false)
    else
        self:DoPunch()
    end
    
    
end

function SWEP:SecondaryAttack() 

    local ply = self:GetOwner()
    if ( !ply:IsValid() ) then return end
    if ply:GetNWBool("bm_shift") then
        self:BloodBind(ply)
        return
    end
    if ply:GetNWInt("bm_mode") == 1 then
        self:BloodEdge(ply, true)

    else
        self:Melee(ply)
    end
end

hook.Add("GetFallDamage", "bm_GetFallDamage", function(ply)-- no more silly fall damage
	if ply:GetActiveWeapon():GetClass() == "bloodmanipulation" then
		return 0
	end
end)


hook.Add("KeyPress", "bloodmanipulation", function(ply, key)
    
    if ply:InVehicle() then return end

    local weapon = ply:GetActiveWeapon()

    if IsValid(weapon) and weapon.KeyPress then
        weapon:KeyPress(ply, key)
    end

end)

hook.Add("PlayerButtonDown", "bm_SwitchModes", function(ply, button)
    if button == KEY_LALT and ply:GetActiveWeapon():GetClass() == "bloodmanipulation" then
        if ply:GetNWBool("bm_debounce") then return end
        ply:SetNWBool("bm_debounce", true)

        if ply:GetNWBool("bm_shift") then
            ply:SetNWBool("bm_mode", ply:GetNWBool("bm_mode") - 1)
        else
            ply:SetNWBool("bm_mode", ply:GetNWBool("bm_mode") + 1)
        end
        local max = 1
    
        if ply:GetNWInt("bm_mode") > max then

            ply:SetNWInt("bm_mode", 0)

        elseif ply:GetNWInt("bm_mode") < 0 then
            
            ply:SetNWInt("bm_mode", max)

        end

        timer.Simple(0.2, function()
            ply:SetNWBool("bm_debounce", false)
        end)
    end
end)

SWEP.zone_delay = 0
SWEP.pierce_delay = 0
SWEP.hp_delay = 0
SWEP.flowing_delay = 0
SWEP.trail_delay = 0

SWEP.red_effect = false 
SWEP.wing_effect = false

if SERVER then
    util.AddNetworkString("UpdateBloodBar")
    util.AddNetworkString("UpdateFlowingRed")
    util.AddNetworkString("UpdateWingKing")

    function SWEP:Think()

        local ply = self:GetOwner()
        
        if !IsValid(ply) then return end

        local currentHealth = ply:Health()
        local maxHealth = self.maxHP

        if ply:GetNWInt("bm_pity") < 0 then 
            ply:SetNWInt("bm_pity", 1)
        end
        if self.wk_jump then
            self.lunge = false
            self.double_jump = true

        end

        if self.lunge and ply:OnGround() then
            self.lunge = false
        end

        if ply:OnGround() then
            self.double_jump = true
        end

        if ( ply:GetNWInt("bm_mode") == 0 and self.defaultHoldType ~= 'normal') then
            self.defaultHoldType = "normal"
            self:SetHoldType(self.defaultHoldType)

        elseif ( ply:GetNWInt("bm_mode") == 1 and self.defaultHoldType ~= 'knife') then
            self.defaultHoldType = "knife"
            self:SetHoldType(self.defaultHoldType)
            ply:EmitSound("bloodmanipulation/blood_edge_equip.wav", 350, 100, 1, CHAN_STATIC, SND_NOFLAGS)
            ply:EmitSound("bloodmanipulation/poison.wav", 350, 120, 1, CHAN_STATIC, SND_NOFLAGS)
    
        end

        local function end_pierce()

            if IsValid(self.blood_ball) then
                
                self.blood_ball:StopLoopingSound(1)
                self.blood_ball:EmitSound("bloodmanipulation/piercing_blood_end.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)

                self.blood_ball:Remove()
            end
        
            if IsValid(self.blood_piercer) then
                self.blood_piercer:Remove()
            end
        
            self.piercing_active = false
            self.piercing_cd = false
            self.piercing_projectile = false
            self:SetHoldType("Normal")

        end

        if CurTime() > self.flowing_delay then

            self.flowing_delay = CurTime() + 0.15
            self.flowing_red = self.flowing_red - 0.5
        end


        if self.blood_bar >= 30 then
            self.blood_bar = 30
            
        end

        if self.flowing_red >= 100 then
            self.flowing_red = 100
            
        end

        if self.flowing_red < 0 then
            self.flowing_red = 0
            
        end

        if self.red_scale and !self.red_effect then
            self.red_effect = true 
            self:StatusEffect(ply)
        elseif !self.red_scale then
            self.red_effect = false 
        end

        if self.wingking and !self.wing_effect then
            self.wing_effect = true 
            ply:EmitSound("bloodmanipulation/wingking.wav", 350, 100, 1, CHAN_AUTO)

        elseif !self.wingking then
            self.wing_effect = false 

        end

        if self.flowing_red >= 15 then
            self.red_scale = true -- damage buff, speed etc.

        else
            self.red_scale = false

        end

        if self.flowing_red >= 50 then
            self.wingking = true
        else
            self.wingking = false
          
        end
        
        net.Start("UpdateWingKing")
        net.WriteBool(self.wingking)
        net.Send(ply)

        net.Start("UpdateBloodBar")
        net.WriteInt(self.blood_bar, 32)
        net.Send(ply)

        net.Start("UpdateFlowingRed")
        net.WriteInt(self.flowing_red, 32)
        net.Send(ply)

        if self.piercing_active then

            self.blood_bar = self.blood_bar - 0.2
            

            if self.blood_bar <= 0 then
                self.blood_bar = 0

                if SERVER then
                    ply:SetHealth(math.min(currentHealth - 15, maxHealth))
                    if ply:Health() <= 0 then
                        ply:Kill()
                    end
                end
            
            end
            
            local damage = 12
            
            if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end
                            
            if !ply:Alive() then
                if IsValid(ply.blood_ball) then
                    ply.blood_ball:Remove()
                end
                if IsValid(ply.blood_piercer) then
                    ply.blood_piercer:Remove()
                end
                return
            end
            
            local ball_trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + ( (ply:GetAimVector() + Vector(0,0,-0.3)) * 50 ),
                filter = ply
            })

            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + ( ply:GetAimVector() * 100000 ),
                filter = ply
            })

            self.blood_ball:SetPos(ball_trace.HitPos)
            self.blood_piercer:SetPos(trace.HitPos)
            self.blood_piercer:SetAngles(ply:EyeAngles())
            self.blood_piercer:EmitSound("bloodmanipulation/slice_hit.wav", 350, math.random(100,120), 1, CHAN_STATIC, SND_NOFLAGS)
            util.ScreenShake( self.blood_piercer:GetPos(), 10, 40, 0.5, 1000, true)

            local entities = ents.FindInSphere(self.blood_piercer:GetPos(), 500)
                    
            for _, ent in ipairs(entities) do

                if ( ent:IsValid() and ent ~= ply and ent:IsSolid() ) and !( ent:GetNWBool("barrier") ) then
                    if SERVER then
                        ent:TakeDamage(damage, ply, self)
                        self.flowing_red = self.flowing_red + 0.2

                        if self.wingking then
                            self:Poison(ply, ent, 0.5, 2, 100)

                        end

                    end
                end
            end
        end
    
        if ply:KeyDown(IN_USE) then
            
            if self.piercing_active then
                self.piercing = true 
                self:SetHoldType("revolver")
            end
        elseif self.piercing then
            self.piercing = false
            end_pierce()

        
        end

        if !self.piercing_active then
            if currentHealth ~= maxHealth then
                if ply:GetNWBool("bm_zone") then
                    ply:SetHealth(math.min(currentHealth + 4, maxHealth))
                else
                    ply:SetHealth(math.min(currentHealth + 2, maxHealth))
        
                end
            end

            self.blood_bar = self.blood_bar + 0.1
            
        end
        

        if CurTime() > self.zone_delay then

            if ply:GetNWBool("bm_zone") then
                self.zone_delay = CurTime() + 1

                local max_meter = 120
            
                ply:SetNWInt("bm_zone_meter", math.min( ply:GetNWInt("bm_zone_meter") - 1, max_meter))  

                if ply:GetNWInt("bm_zone_meter") < 0 then
                    ply:SetNWInt("bm_zone_meter", 1)
                elseif ply:GetNWInt("bm_zone_meter") == 0 then
                    ply:SetNWBool("bm_zone", false)
                    ply:ChatPrint("~ you are no longer in the zone ~")

                    ply:SetNWInt("bm_zone_meter", max_meter)

                end
                
                if ply:GetNWInt("bm_zone_meter") > max_meter then
                    ply:SetNWInt("bm_zone_meter", max_meter)
                end

            end
        end

        if ply:KeyDown(IN_SPEED) then

            if ply:InVehicle() then return end
            ply:SetNWBool("bm_shift", true)

        elseif ply:GetNWBool("bm_shift") then
            ply:SetNWBool("bm_shift", false)
        end

        if !self.equipped then
            self.equipped = true
            ply:SetHealth(self.maxHP)
        
        end
        ply:SetJumpPower(400)
        ply:SetWalkSpeed(800)
        ply:SetRunSpeed(1500)

        if ply:GetNWBool("bm_zone") then ply:SetWalkSpeed(1000) ply:SetRunSpeed(1500) ply:SetJumpPower(500) end
        if self.red_scale then ply:SetWalkSpeed(1000) ply:SetRunSpeed(1500) ply:SetJumpPower(500) end

        if ply:GetNWBool("bm_zone") and self.red_scale then ply:SetWalkSpeed(1200) ply:SetRunSpeed(1700) ply:SetJumpPower(500) end

        if self.piercing_active then
            ply:SetWalkSpeed(100) ply:SetRunSpeed(100)
        end

        -- trail after jump

    
        if !ply:OnGround() and !self.double_jump then
            if CurTime() > self.trail_delay then
                self.trail_delay = CurTime() + 0.1
                local RFoot = ply:LookupBone("ValveBiped.Bip01_R_Foot")
                local LFoot = ply:LookupBone("ValveBiped.Bip01_L_Foot")
        
                if !RFoot or !LFoot then return end
                local RPos = ply:GetBonePosition(RFoot)
                local LPos = ply:GetBonePosition(LFoot)
        
                ParticleEffect("bm_blood_trail", RPos, Angle(0,0,0), self)
                ParticleEffect("bm_blood_trail", LPos, Angle(0,0,0), self)
            end
        end

    end

end