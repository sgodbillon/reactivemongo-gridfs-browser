import sbt._
import Keys._
import play.Project._

object ApplicationBuild extends Build {

  val appName         = "ReactiveMongo-GridFS-Browser"
  val appVersion      = "1.0-SNAPSHOT"

  val appDependencies = Seq(
    "org.reactivemongo" %% "play2-reactivemongo" % "0.1-SNAPSHOT"
  )


  val main = play.Project(appName, appVersion, appDependencies).settings(
    //resolvers += "Sonatype snapshots" at "http://oss.sonatype.org/content/repositories/snapshots/"
    //resolvers += "sgodbillon" at "https://bitbucket.org/sgodbillon/repository/raw/master/snapshots/"
  )

}
