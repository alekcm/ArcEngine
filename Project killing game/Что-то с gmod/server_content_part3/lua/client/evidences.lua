local ev = nil

net.Receive("SendEvidenceByLookForIt2", function ()

                if ev == nil then
    
    local tbl = net.ReadString()
    print(tbl)
    local ent = net.ReadEntity()
    --local tbl = ent:GetNWString("EvidenceText")
    local text = tbl
    local bool = true
    for v,info in pairs(Evidences) do
        if info == text then 
            bool = false
            break
        end
    end
if bool == true then
    if text ~= "" then
    table.ForceInsert(Evidences, text)
    table.ForceInsert(EvidencesHtml, tbl[2])
    table.ForceInsert(EvidencesBigHtml, tbl[3])
    net.Start("GetEvidenceIcon")
    net.WriteEntity(ent)
    net.SendToServer()
end
end

    local DFrame = vgui.Create("DFrame")
    DFrame.Paint = function (self,w,h)
end
    local CImage = vgui.Create("DImage",DFrame)
    ev = DFrame
    CImage:SetSize(400, 600)
        DFrame:SetSize( 400, 600)
    DFrame:SetPos(ScrW()/2+100,ScrH()/2-300)
    DFrame:SetTitle("")
    local htmlpath = tbl[2]
    CImage:SetImage("materials/sprites/ui/world/evidencewohtml.png")
    local CLabel = vgui.Create( "DLabel", CImage)
    local sleep = LocalPlayer():GetNWFloat("PlayerSleep",100)
    local text2 = ""
    local enters = 0
    local i = 0
    local cnt = 0
    local text145 = ""
    local text146 = ""
    while i ~= 10000 do
        --text145 = text145..text[i] 
        text146 = text146..text[i]
        if text[i] == '\n' then
            enters = enters + 1
            cnt = i
        end
        if text[i] == " " or (text[i] == "" and text[i-1] ~= "") then
            if i <= cnt + 95 then
                text145 = text145..text146
                text146 = ""
            else
                text145 = text145.."\n"..text146
                text146 = ""
                enters = enters + 1
                cnt = i
            end
        end
--[[        if i > cnt + 105 and text[i] == " " then
            text145 = text145.."\n"
            enters = enters + 1
            --text[cnt] = string.char(10)
            cnt = i
        end--]] 
        if sleep <= 25 then
            local rn = math.random(1,25)
            if rn > sleep*100 and text[i] ~= '\n' and text[i] ~= nil then
                --text2 = text2--..--tonumber(text[i])--'*'
            else
            text2 = text2..text[i]
        end
        end
        i = i + 1
    end
            --print(text145)
    
            --CLabel:SetText("Хуй")
    if sleep >= 25 then
        CLabel:SetText(text145)
                else
        CLabel:SetText(text2)
    end
    CLabel:SetPos( 10, -285 + enters*6.5)
    CLabel:SetSize( 380, 600 )
end
    end)

hook.Add("Think", "WatchingForEvidances", function ()
            local eyetrace = LocalPlayer():GetEyeTrace()
            if !eyetrace.Entity:IsValid() then
                if ev ~= nil then
                ev:Remove()
                ev = nil
                end
            else
            if (eyetrace.Entity:GetClass() ~= "evidence") then
                if ev ~= nil then
                ev:Remove()
                ev = nil
            end
            else
                local ent = eyetrace.Entity
                local dist = LocalPlayer():GetPos():Distance(ent:GetPos())
                local drawdist = GetObservation() * 5 * ent:GetVision() * 1.4
                if dist < drawdist then
                    if ev == nil then
                
                


                net.Start("SendEvidenceByLookForIt")
                net.WriteEntity(ent)
                net.SendToServer()
                            end     

            else
                if ev ~= nil then
                ev:Remove()
                ev = nil
            end
            end

        end
    end
            end)






--Desc

local de = nil

net.Receive("SendDescByLookForIt2", function ()

                if de == nil then

    local tbl = net.ReadString()
    local ent = net.ReadEntity()
    --local tbl = ent:GetNWString("EvidenceText")
    local text = tbl
    local bool = true

    local DFrame = vgui.Create("DFrame")
    DFrame.Paint = function (self,w,h)
end
    local CImage = vgui.Create("DImage",DFrame)
    de = DFrame
    CImage:SetSize(ScrW()/4, ScrH()/1.5)
        DFrame:SetSize( ScrW(), ScrH())
    DFrame:SetPos(ScrW()/2+100,ScrH()/2-300)
    DFrame:SetTitle("")
    local html = vgui.Create( "HTML", DFrame )
            html:SetSize(ScrW()/5.5, ScrH()/1.5)
            html:SetPos(CImage:GetX()+CImage:GetWide(),CImage:GetY())
            html:OpenURL( ent:GetHTMLPath() )
    local html2 = vgui.Create( "HTML", DFrame )
            html2:SetSize(ScrW()/4, ScrH()/6)
            html2:SetPos(CImage:GetX(),CImage:GetY()+CImage:GetTall())
            html2:OpenURL( ent:GetBigHTMLPath() )
    local htmlpath = tbl[2]
    CImage:SetImage("materials/sprites/ui/world/descwohtml.png")
    local CLabel = vgui.Create( "DLabel", CImage)
    local sleep = LocalPlayer():GetNWFloat("PlayerSleep",100)
    local text2 = ""
    local enters = 0
    local i = 0
    local cnt = 0
    local text145 = ""
    local text146 = ""
    while i ~= 10000 do
        --text145 = text145..text[i] 
        text146 = text146..text[i]
        if text[i] == '\n' then
            enters = enters + 1
            cnt = i
        end
        if text[i] == " " or (text[i] == "" and text[i-1] ~= "") then
            if i <= cnt + 95 then
                text145 = text145..text146
                text146 = ""
            else
                text145 = text145.."\n"..text146
                text146 = ""
                enters = enters + 1
                cnt = i
            end
        end
--[[        if i > cnt + 105 and text[i] == " " then
            text145 = text145.."\n"
            enters = enters + 1
            --text[cnt] = string.char(10)
            cnt = i
        end--]] 
        if sleep <= 25 then
            local rn = math.random(1,25)
            if rn > sleep*100 and text[i] ~= '\n' and text[i] ~= nil then
                --text2 = text2--..--tonumber(text[i])--'*'
            else
            text2 = text2..text[i]
        end
        end
        i = i + 1
    end
            --print(text145)
    
            --CLabel:SetText("Хуй")
    if sleep >= 25 then
        CLabel:SetText(text145)
                else
        CLabel:SetText(text2)
    end
    CLabel:SetPos( 10, -285 + enters*6.5)
    CLabel:SetSize( 380, 600 )
end
    end)

hook.Add("Think", "WatchingForDesc", function ()
            local eyetrace = LocalPlayer():GetEyeTrace()
            if !eyetrace.Entity:IsValid() then
                if de ~= nil then
                de:Remove()
                de = nil
                end
            else
            if (eyetrace.Entity:GetClass() ~= "desc") then
                if de ~= nil then
                de:Remove()
                de = nil
            end
            else
                local ent = eyetrace.Entity
                local dist = LocalPlayer():GetPos():Distance(ent:GetPos())
                local drawdist = 5 * 5 * ent:GetVision() * 1.4
                if dist < drawdist then
                    if de == nil then
                
                


                net.Start("SendDescByLookForIt")
                net.WriteEntity(ent)
                net.SendToServer()
                            end     

            else
                if de ~= nil then
                de:Remove()
                de = nil
            end
            end

        end
    end
            end)